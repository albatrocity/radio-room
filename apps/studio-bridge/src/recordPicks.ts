import { createHash, randomBytes } from "node:crypto"
import {
  getSpotifyAlbumPick,
  parseSpotifyAlbumId,
  searchSpotifyAlbums,
  SpotifyAppCredentialsError,
} from "@repo/spotify-catalog"
import { inferPhysicalMediaFormat } from "@repo/plugin-item-shops"
import { rankAlbumsByRelevance } from "@repo/utils"
import {
  normalizeRecordGenres,
  type LibraryAlbumRow,
  type PhysicalMediaPick,
  type PickableRecordSource,
} from "@repo/types"
import {
  loadSpotifyCredentials,
  navidromeConfig,
  type NavidromeConfig,
} from "./recordSourceCredentials.js"

/**
 * Album lookups behind Game Studio's record picker (ADR 0216). The only
 * studio-bridge routes that reach the network: Spotify with the app's client
 * credentials, the designer's Navidrome over Subsonic. Credentials come from
 * the env, the repo-root `.env`, or the bridge daemon's config
 * (`recordSourceCredentials.ts`).
 */

/** A search row: what the picker lists before the designer adds it. */
export type RecordSearchHit = Omit<PhysicalMediaPick, "format" | "lore"> & {
  /** Preview cover; a local hit's is a bridge-relative path, never saved into a map. */
  coverUrl?: string
}

export type RecordSearchResult = {
  results: RecordSearchHit[]
  /** Sources that couldn't search, and why (shown in the picker). */
  unavailable: { source: PickableRecordSource; reason: string }[]
}

loadSpotifyCredentials()

function subsonicUrl(
  config: NavidromeConfig,
  method: string,
  params: Record<string, string>,
): string {
  const salt = randomBytes(6).toString("hex")
  const token = createHash("md5")
    .update(config.password + salt)
    .digest("hex")
  const query = new URLSearchParams({
    ...params,
    u: config.user,
    t: token,
    s: salt,
    v: "1.16.1",
    c: "game-studio",
    f: "json",
  })
  return `${config.url}/rest/${method}.view?${query}`
}

type SubsonicAlbum = {
  id: string
  name: string
  artist?: string
  year?: number
  songCount?: number
}

async function subsonic<T>(
  config: NavidromeConfig,
  method: string,
  params: Record<string, string>,
) {
  const response = await fetch(subsonicUrl(config, method, params))
  if (!response.ok) throw new Error(`Navidrome ${method} failed: ${response.status}`)
  const body = (await response.json()) as { "subsonic-response"?: { status?: string } & T }
  const payload = body["subsonic-response"]
  if (payload?.status !== "ok") throw new Error(`Navidrome ${method} returned an error`)
  return payload
}

function localHit(album: SubsonicAlbum): RecordSearchHit {
  return {
    source: "local",
    id: album.id,
    title: album.name,
    artist: album.artist?.trim() || "Unknown artist",
    ...(album.year ? { year: album.year } : {}),
    trackCount: Math.max(1, album.songCount ?? 1),
    coverUrl: `/records/local/${encodeURIComponent(album.id)}/cover`,
  }
}

async function searchLocal(config: NavidromeConfig, query: string): Promise<RecordSearchHit[]> {
  const payload = await subsonic<{ searchResult3?: { album?: SubsonicAlbum[] } }>(
    config,
    "search3",
    {
      query,
      albumCount: "10",
      artistCount: "0",
      songCount: "0",
    },
  )
  return (payload.searchResult3?.album ?? []).map(localHit)
}

function credentialsMessage(error: unknown): string {
  return error instanceof SpotifyAppCredentialsError
    ? "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the repo's .env"
    : error instanceof Error
      ? error.message
      : "Search failed"
}

/** Spotify and local results side by side; a source that fails says why. */
export async function searchRecords(query: string): Promise<RecordSearchResult> {
  const trimmed = query.trim()
  const out: RecordSearchResult = { results: [], unavailable: [] }
  if (!trimmed) return out

  const navidrome = navidromeConfig()
  const [spotify, local] = await Promise.allSettled([
    searchSpotifyAlbums(trimmed),
    navidrome
      ? searchLocal(navidrome, trimmed)
      : Promise.reject(
          new Error("Set up the Media Bridge daemon's Navidrome login, or NAVIDROME_URL/USER/PASSWORD"),
        ),
  ])
  if (spotify.status === "fulfilled") {
    out.results.push(
      ...spotify.value.map((hit) => ({
        ...hit,
        ...(hit.imageUrl ? { coverUrl: hit.imageUrl } : {}),
      })),
    )
  } else {
    out.unavailable.push({ source: "spotify", reason: credentialsMessage(spotify.reason) })
  }
  if (local.status === "fulfilled") out.results.push(...local.value)
  else out.unavailable.push({ source: "local", reason: credentialsMessage(local.reason) })
  // Add to Queue's relevance order; a matching library album beats the stream's copy.
  out.results = rankAlbumsByRelevance(trimmed, out.results, { promoteSource: "local" })
  return out
}

/** The pick's format, inferred the same way rooms do when the designer hasn't chosen one. */
export function withPickFormat(pick: PhysicalMediaPick): PhysicalMediaPick {
  if (pick.format) return pick
  return { ...pick, format: inferPhysicalMediaFormat(pick.year, pick.trackCount, pick.id).token }
}

/**
 * A ready pick, format filled. Local picks carry no image: the room fills its
 * own sleeve and lore from its library.
 */
export async function getRecordPick(source: string, id: string): Promise<PhysicalMediaPick | null> {
  if (source === "spotify") {
    if (!parseSpotifyAlbumId(id)) return null
    const pick = await getSpotifyAlbumPick(id)
    return pick ? withPickFormat(pick) : null
  }
  if (source === "local") {
    const navidrome = navidromeConfig()
    if (!navidrome) return null
    const payload = await subsonic<{ album?: SubsonicAlbum }>(navidrome, "getAlbum", { id })
    if (!payload.album) return null
    const { coverUrl: _cover, ...pick } = localHit(payload.album)
    return withPickFormat(pick)
  }
  return null
}

/** Most library albums the sandbox loads; a huge library still previews quickly. */
const LIBRARY_ALBUM_CAP = 2000
const LIBRARY_PAGE = 500

type SubsonicLibraryAlbum = SubsonicAlbum & {
  userRating?: number
  genre?: string
  genres?: { name?: string }[]
}

/**
 * The designer's Navidrome albums as `LibraryAlbumRow`s, so Game Studio's
 * sandbox can derive records like a bridge room does (ADR 0216). Empty when
 * Navidrome isn't configured or reachable.
 */
export async function listLibraryAlbums(): Promise<LibraryAlbumRow[]> {
  const navidrome = navidromeConfig()
  if (!navidrome) return []
  const rows: LibraryAlbumRow[] = []
  for (let offset = 0; offset < LIBRARY_ALBUM_CAP; offset += LIBRARY_PAGE) {
    const payload = await subsonic<{ albumList2?: { album?: SubsonicLibraryAlbum[] } }>(
      navidrome,
      "getAlbumList2",
      { type: "alphabeticalByName", size: String(LIBRARY_PAGE), offset: String(offset) },
    )
    const page = payload.albumList2?.album ?? []
    for (const album of page) {
      const genres = normalizeRecordGenres([
        ...(album.genre ? [album.genre] : []),
        ...(album.genres ?? []).map((g) => g.name),
      ])
      rows.push({
        id: album.id,
        name: album.name,
        ...(album.artist ? { artist: album.artist } : {}),
        ...(album.year ? { year: album.year } : {}),
        ...(album.songCount ? { songCount: album.songCount } : {}),
        ...(album.userRating ? { userRating: album.userRating } : {}),
        ...(genres.length > 0 ? { genres } : {}),
      })
    }
    if (page.length < LIBRARY_PAGE) break
  }
  return rows.slice(0, LIBRARY_ALBUM_CAP)
}

/** A local album's cover, proxied so the designer's Navidrome password stays server-side. */
export async function fetchLocalCover(id: string): Promise<Response | null> {
  const navidrome = navidromeConfig()
  if (!navidrome) return null
  const response = await fetch(subsonicUrl(navidrome, "getCoverArt", { id, size: "300" }))
  return response.ok ? response : null
}
