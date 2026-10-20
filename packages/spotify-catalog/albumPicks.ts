import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import type { PhysicalMediaPick } from "@repo/types"
import { getSpotifyClientCredentialsToken } from "./getSpotifyClientCredentialsToken"

/**
 * Album lookups for designer-picked records (ADR 0216), with the app's
 * client-credentials token. Game Studio searches through these and saves the
 * result into a trip map, so rooms never need them.
 */

const DEFAULT_MARKET = "US"
type SearchMarket = Parameters<SpotifyApi["search"]>[2]
type SearchLimit = Parameters<SpotifyApi["search"]>[3]
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/

/** One album search hit, shaped like a pick before its lore and format are settled. */
export type SpotifyAlbumHit = Omit<PhysicalMediaPick, "format" | "lore"> & { source: "spotify" }

type AlbumLike = {
  id: string
  name: string
  artists: { name: string }[]
  release_date?: string
  total_tracks: number
  images?: { url: string; width?: number | null }[]
}

/** A bare id, an `open.spotify.com/album/…` URL, or a `spotify:album:` URI → the album id. */
export function parseSpotifyAlbumId(input: string): string | null {
  const text = input.trim()
  if (SPOTIFY_ID.test(text)) return text
  const uri = /^spotify:album:([0-9A-Za-z]{22})$/.exec(text)
  if (uri) return uri[1]!
  try {
    const url = new URL(text)
    if (!url.hostname.endsWith("spotify.com")) return null
    const match = /\/album\/([0-9A-Za-z]{22})(?:\/|$)/.exec(url.pathname)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

function releaseYear(date: string | undefined): number | undefined {
  const year = Number(date?.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : undefined
}

function largestImage(images: AlbumLike["images"]): string | undefined {
  return [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
}

function toHit(album: AlbumLike): SpotifyAlbumHit {
  const year = releaseYear(album.release_date)
  const imageUrl = largestImage(album.images)
  return {
    source: "spotify",
    id: album.id,
    title: album.name,
    artist: album.artists.map((a) => a.name).join(", ") || "Unknown artist",
    ...(year ? { year } : {}),
    trackCount: Math.max(1, album.total_tracks),
    ...(imageUrl ? { imageUrl } : {}),
  }
}

/**
 * "Released 1972 on Reprise. ℗ 1972 Reprise Records" from what Spotify
 * offers; Spotify has no album description.
 */
export function spotifyAlbumLore(album: {
  release_date?: string
  label?: string
  copyrights?: { text: string; type: string }[]
}): string | undefined {
  const year = releaseYear(album.release_date)
  const label = album.label?.trim()
  const released = year
    ? `Released ${year}${label ? ` on ${label}` : ""}.`
    : label
      ? `Released on ${label}.`
      : ""
  const phonogram = album.copyrights?.find((c) => c.type === "P")?.text.trim()
  const line = phonogram ? (phonogram.startsWith("℗") ? phonogram : `℗ ${phonogram}`) : ""
  const lore = [released, line].filter(Boolean).join(" ")
  return lore || undefined
}

async function client(): Promise<SpotifyApi> {
  const { accessToken, clientId } = await getSpotifyClientCredentialsToken()
  return SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "",
  })
}

export async function searchSpotifyAlbums(
  query: string,
  options?: { market?: string; limit?: number },
): Promise<SpotifyAlbumHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const spotify = await client()
  const market = (options?.market ?? DEFAULT_MARKET) as SearchMarket
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 20) as SearchLimit
  const results = await spotify.search(trimmed, ["album"], market, limit)
  return (results.albums?.items ?? []).map((album) => toHit(album as AlbumLike))
}

/**
 * A ready pick for one album: snapshot fields plus lore. A single defaults to
 * a 45; other formats are left for the caller to infer.
 */
export async function getSpotifyAlbumPick(idOrUrl: string): Promise<PhysicalMediaPick | null> {
  const id = parseSpotifyAlbumId(idOrUrl)
  if (!id) return null
  const spotify = await client()
  const album = await spotify.albums.get(id, DEFAULT_MARKET as SearchMarket)
  if (!album) return null
  const lore = spotifyAlbumLore(album)
  return {
    ...toHit(album as AlbumLike),
    ...(album.album_type === "single" ? { format: "45" as const } : {}),
    ...(lore ? { lore } : {}),
  }
}
