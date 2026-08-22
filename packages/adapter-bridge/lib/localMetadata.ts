import type {
  MetadataGetAlbumResult,
  MetadataGetArtistResult,
  MetadataListAlbumsParams,
  MetadataListAlbumsResult,
  MetadataListArtistsParams,
  MetadataListArtistsResult,
  MetadataSourceAdapter,
  MetadataSourceAdapterConfig,
  MetadataSourceApi,
  MetadataSourceTrack,
  SimpleCache,
} from "@repo/types"
import type { AppContext } from "@repo/types"
import {
  LOCAL_BROWSE_CACHE_TTL_SEC,
  metadataBrowseAlbumCacheKey,
  metadataBrowsePlaylistCacheKey,
  withCachedJson,
} from "@repo/utils"
import { BridgeRpcClient } from "./rpcClient"
import { emptyAlbum, emptyArtist } from "./trackHelpers"

/**
 * Local metadata source — search/browse is RPC to the connected bridge daemon.
 * findById synthesizes a minimal track when daemon is absent (queue hydration).
 */
export function createLocalMetadataApi(deps: {
  getRpcForRoom: (roomId: string) => BridgeRpcClient | null
  /** Room id closed over at register time when available; otherwise RPC uses first present room. */
  roomId?: string
  cache?: SimpleCache
}): MetadataSourceApi {
  async function withRpc<T>(fn: (rpc: BridgeRpcClient, roomId: string) => Promise<T>, fallback: T): Promise<T> {
    const roomId = deps.roomId
    if (!roomId) return fallback
    const rpc = deps.getRpcForRoom(roomId)
    if (!rpc || !(await rpc.isPresent())) return fallback
    return fn(rpc, roomId)
  }

  async function searchViaDaemon(
    query: string,
    options?: { playlistIds?: string[]; albumIds?: string[] },
  ): Promise<MetadataSourceTrack[]> {
    return withRpc(async (rpc) => {
      const result = (await rpc.call("search", {
        query,
        source: "local",
        ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
        ...(options?.albumIds?.length ? { albumIds: options.albumIds } : {}),
      })) as MetadataSourceTrack[]
      return Array.isArray(result) ? result : []
    }, [])
  }

  return {
    async search(query: string, options?: { playlistIds?: string[]; albumIds?: string[] }) {
      return searchViaDaemon(query, options)
    },
    async searchByParams(params) {
      const artist = params.artists?.[0]?.title ?? ""
      return searchViaDaemon([params.title, artist].filter(Boolean).join(" "))
    },
    async findById(id: string, options?: { playlistIds?: string[]; albumIds?: string[] }) {
      const fromDaemon = await withRpc(async (rpc) => {
        try {
          const track = (await rpc.call("getTrack", {
            source: "local",
            trackId: id,
            ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
            ...(options?.albumIds?.length ? { albumIds: options.albumIds } : {}),
          })) as MetadataSourceTrack | null
          return track?.id ? track : null
        } catch {
          return null
        }
      }, null)
      if (fromDaemon) return fromDaemon
      // Last resort stub so queue hydration can still play; daemon resolves title on play
      return {
        id,
        title: id,
        urls: [{ type: "resource", url: `local:${id}`, id }],
        artists: [emptyArtist("", "Local")],
        album: emptyAlbum(),
        duration: 0,
        explicit: false,
        trackNumber: 0,
        discNumber: 0,
        popularity: 0,
        images: [],
      }
    },
    getBrowseCapabilities() {
      return { entryMode: "index" as const, albumSearch: true }
    },
    async listArtists(params?: MetadataListArtistsParams): Promise<MetadataListArtistsResult> {
      return withRpc(async (rpc) => {
        const result = (await rpc.call("listArtists", {
          source: "local",
          query: params?.query,
          offset: params?.offset,
          limit: params?.limit,
          ...(params?.playlistIds?.length ? { playlistIds: params.playlistIds } : {}),
          ...(params?.albumIds?.length ? { albumIds: params.albumIds } : {}),
        })) as MetadataListArtistsResult
        return result?.items ? result : { items: [], total: 0 }
      }, { items: [], total: 0 })
    },
    async listAlbums(params?: MetadataListAlbumsParams): Promise<MetadataListAlbumsResult> {
      return withRpc(async (rpc) => {
        const result = (await rpc.call("listAlbums", {
          source: "local",
          query: params?.query,
          offset: params?.offset,
          limit: params?.limit,
          ...(params?.playlistIds?.length ? { playlistIds: params.playlistIds } : {}),
          ...(params?.albumIds?.length ? { albumIds: params.albumIds } : {}),
        })) as MetadataListAlbumsResult
        return result?.items ? result : { items: [], total: 0 }
      }, { items: [], total: 0 })
    },
    async getArtist(
      artistId: string,
      options?: { playlistIds?: string[]; albumIds?: string[] },
    ): Promise<MetadataGetArtistResult | null> {
      return withRpc(async (rpc) => {
        return (await rpc.call("getArtist", {
          source: "local",
          artistId,
          ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
          ...(options?.albumIds?.length ? { albumIds: options.albumIds } : {}),
        })) as MetadataGetArtistResult | null
      }, null)
    },
    async getAlbum(
      albumId: string,
      options?: { playlistIds?: string[]; albumIds?: string[] },
    ): Promise<MetadataGetAlbumResult | null> {
      const roomId = deps.roomId
      if (!roomId) return null
      const rpc = deps.getRpcForRoom(roomId)
      if (!rpc) return null
      return fetchLocalAlbumResult({
        rpc,
        albumId,
        roomId,
        cache: deps.cache,
        playlistIds: options?.playlistIds,
        albumIds: options?.albumIds,
      })
    },
  }
}

/** Placeholder module registration — real room-scoped RPC wiring happens in AdapterService. */
export const localMetadataSource: MetadataSourceAdapter = {
  register: async (config: MetadataSourceAdapterConfig) => {
    const api = createLocalMetadataApi({
      getRpcForRoom: () => null,
      roomId: undefined,
    })
    await config.onRegistered?.({ name: config.name })
    return {
      name: config.name,
      authentication: config.authentication,
      api,
    }
  },
}

/**
 * Build a room-scoped local metadata source that uses the bridge RPC client.
 */
export function registerLocalMetadataForRoom(params: {
  roomId: string
  context: AppContext
  rpc: BridgeRpcClient
  authentication: MetadataSourceAdapterConfig["authentication"]
}) {
  const api = createLocalMetadataApi({
    getRpcForRoom: () => params.rpc,
    roomId: params.roomId,
    cache: params.context.cache,
  })
  return {
    name: "local",
    authentication: params.authentication,
    api,
  }
}

/** Ask the daemon which of the given Navidrome playlist/album ids contain a local track. */
export async function checkLocalTrackPlaylistMembership(params: {
  rpc: BridgeRpcClient
  trackId: string
  playlistIds?: string[]
  albumIds?: string[]
  /** When true, response.albumIds includes the track's Navidrome album id (for local SKU lookup). */
  includeTrackAlbumId?: boolean
  firstMatch?: boolean
}): Promise<{ playlistIds: string[]; albumIds: string[] }> {
  const playlistIds = Array.from(
    new Set((params.playlistIds ?? []).map((id) => id.trim()).filter(Boolean)),
  )
  const albumIds = Array.from(
    new Set((params.albumIds ?? []).map((id) => id.trim()).filter(Boolean)),
  )
  const empty = { playlistIds: [] as string[], albumIds: [] as string[] }
  const includeTrackAlbumId = params.includeTrackAlbumId === true
  if (!params.trackId || (playlistIds.length === 0 && albumIds.length === 0 && !includeTrackAlbumId)) {
    return empty
  }
  if (!(await params.rpc.isPresent())) return empty
  try {
    const result = (await params.rpc.call("checkPlaylistMembership", {
      source: "local",
      trackId: params.trackId,
      ...(playlistIds.length ? { playlistIds } : {}),
      ...(albumIds.length ? { albumIds } : {}),
      ...(includeTrackAlbumId ? { includeTrackAlbumId: true } : {}),
      ...(params.firstMatch === true ? { firstMatch: true } : {}),
    })) as unknown
    // Old daemons returned string[] of playlist ids only.
    if (Array.isArray(result)) {
      return { playlistIds: result.map(String), albumIds: [] }
    }
    if (!result || typeof result !== "object") return empty
    const rec = result as { playlistIds?: unknown; albumIds?: unknown }
    return {
      playlistIds: Array.isArray(rec.playlistIds) ? rec.playlistIds.map(String) : [],
      albumIds: Array.isArray(rec.albumIds) ? rec.albumIds.map(String) : [],
    }
  } catch {
    return empty
  }
}

export type LocalPlaylistListItem = {
  id: string
  name: string
  songCount?: number
  comment?: string
}

/** Map a daemon `listPlaylists` row; extra/missing fields are ignored (stale DJ Mac). */
export function mapLocalPlaylistRow(row: unknown): LocalPlaylistListItem | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  const id = r.id != null ? String(r.id) : ""
  if (!id) return null
  const comment = typeof r.comment === "string" ? r.comment.trim() : ""
  return {
    id,
    name: r.name != null ? String(r.name) : id,
    ...(typeof r.songCount === "number" ? { songCount: r.songCount } : {}),
    ...(comment ? { comment } : {}),
  }
}

/** List Navidrome playlists on the connected bridge daemon (admin shelf picker). */
export async function listLocalPlaylists(params: {
  rpc: BridgeRpcClient
}): Promise<LocalPlaylistListItem[]> {
  if (!(await params.rpc.isPresent())) return []
  try {
    const result = (await params.rpc.call("listPlaylists", {
      source: "local",
    })) as unknown
    if (!Array.isArray(result)) return []
    return result.map(mapLocalPlaylistRow).filter((x): x is LocalPlaylistListItem => x != null)
  } catch {
    return []
  }
}

export type LocalLibraryAlbumListItem = {
  id: string
  name: string
  artist?: string
  year?: number
  songCount?: number
  /** Subsonic coverArt key only — never a data URI. */
  coverArt?: string
  /** Navidrome userRating (1–5); drives Physical Media rarity (ADR 0111). */
  userRating?: number
}

/** Coerce Subsonic JSON numbers that may arrive as strings. */
export function parseSubsonicNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Copy a finite 1–5 star rating; omit otherwise (stale packs / unrated). */
export function normalizeAlbumUserRating(value: unknown): number | undefined {
  const n = parseSubsonicNumber(value)
  if (n == null) return undefined
  if (n < 1 || n > 5) return undefined
  return Math.round(n)
}

/** Map a daemon `listLibraryAlbums` row; extra/missing fields are ignored (stale DJ Mac). */
export function mapLocalLibraryAlbumRow(row: unknown): LocalLibraryAlbumListItem | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  const id = r.id != null ? String(r.id) : ""
  if (!id) return null
  const coverArt = typeof r.coverArt === "string" ? r.coverArt.trim() : ""
  // Fail closed on data URIs: listLibraryAlbums must only expose cover keys.
  const safeCover = coverArt && !coverArt.startsWith("data:") ? coverArt : ""
  const userRating = normalizeAlbumUserRating(r.userRating)
  const year = parseSubsonicNumber(r.year)
  const songCount = parseSubsonicNumber(r.songCount)
  return {
    id,
    name: r.name != null ? String(r.name) : id,
    ...(typeof r.artist === "string" && r.artist.trim() ? { artist: r.artist.trim() } : {}),
    ...(year != null ? { year } : {}),
    ...(songCount != null ? { songCount } : {}),
    ...(safeCover ? { coverArt: safeCover } : {}),
    ...(userRating != null ? { userRating } : {}),
  }
}

/**
 * List Navidrome albums on the connected bridge daemon (album-shelf SKU derivation).
 * Returns [] when offline / unknown method (old DJ Mac pack).
 */
export async function listLibraryAlbums(params: {
  rpc: BridgeRpcClient
}): Promise<LocalLibraryAlbumListItem[]> {
  if (!(await params.rpc.isPresent())) return []
  try {
    const result = (await params.rpc.call("listLibraryAlbums", {
      source: "local",
    })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .map(mapLocalLibraryAlbumRow)
      .filter((x): x is LocalLibraryAlbumListItem => x != null)
  } catch {
    return []
  }
}

/**
 * Playlist cover art as data URIs keyed by playlist id (Physical Media artwork).
 * Playlists without art are omitted. Values are `{ sm?, lg? }` after normalization
 * so a stale daemon that still returns a flat `Record<id, dataUri>` degrades to
 * row-quality art rather than failing.
 */
export type PlaylistCoverArtVariants = { sm?: string; lg?: string }

function isDataUri(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:")
}

/** Accept both the nested `{ sm, lg }` shape and a legacy flat data-URI string. */
export function normalizePlaylistCoverArtResult(
  result: unknown,
): Record<string, PlaylistCoverArtVariants> {
  if (!result || typeof result !== "object") return {}
  const out: Record<string, PlaylistCoverArtVariants> = {}
  for (const [id, value] of Object.entries(result as Record<string, unknown>)) {
    if (isDataUri(value)) {
      out[id] = { sm: value }
      continue
    }
    if (!value || typeof value !== "object") continue
    const rec = value as { sm?: unknown; lg?: unknown }
    const sm = isDataUri(rec.sm) ? rec.sm : undefined
    const lg = isDataUri(rec.lg) ? rec.lg : undefined
    if (!sm && !lg) continue
    out[id] = { ...(sm ? { sm } : {}), ...(lg ? { lg } : {}) }
  }
  return out
}

export async function getLocalPlaylistCoverArt(params: {
  rpc: BridgeRpcClient
  playlistIds: string[]
}): Promise<Record<string, PlaylistCoverArtVariants>> {
  const playlistIds = Array.from(
    new Set(params.playlistIds.map((id) => id.trim()).filter(Boolean)),
  )
  if (playlistIds.length === 0) return {}
  if (!(await params.rpc.isPresent())) return {}
  try {
    const result = (await params.rpc.call("getPlaylistCoverArt", {
      source: "local",
      playlistIds,
      variants: ["sm", "lg"],
    })) as unknown
    return normalizePlaylistCoverArtResult(result)
  } catch {
    return {}
  }
}

/** Album cover art as data URIs keyed by album id (same variant shape as playlists). */
export async function getLocalAlbumCoverArt(params: {
  rpc: BridgeRpcClient
  albumIds: string[]
}): Promise<Record<string, PlaylistCoverArtVariants>> {
  const albumIds = Array.from(new Set(params.albumIds.map((id) => id.trim()).filter(Boolean)))
  if (albumIds.length === 0) return {}
  if (!(await params.rpc.isPresent())) return {}
  try {
    const result = (await params.rpc.call("getAlbumCoverArt", {
      source: "local",
      albumIds,
      variants: ["sm", "lg"],
    })) as unknown
    return normalizePlaylistCoverArtResult(result)
  } catch {
    return {}
  }
}

/** Drop daemon-side playlist membership and cover-art caches. */
export async function invalidateLocalLibraryCache(params: {
  rpc: BridgeRpcClient
}): Promise<boolean> {
  if (!(await params.rpc.isPresent())) return false
  try {
    const result = (await params.rpc.call("invalidatePlaylistCache", {
      source: "local",
    })) as unknown
    return Boolean(result && typeof result === "object" && (result as { ok?: boolean }).ok)
  } catch {
    return false
  }
}

export type LocalPlaylistTracksResult =
  | { ok: true; tracks: MetadataSourceTrack[] }
  | { ok: false; error: string }

/**
 * Mapping a whole playlist reads tags off disk and fetches cover art per album, so
 * this call gets more headroom than the default RPC timeout.
 */
const PLAYLIST_TRACKS_TIMEOUT_MS = 20000

/**
 * Full album + tracks from the daemon (`getAlbum` RPC).
 * Successful results are Redis-cached when `cache` + `roomId` are provided (ADR 0108),
 * sharing the CatalogBrowse `getAlbum` key for the same membership scope.
 */
export async function fetchLocalAlbumResult(params: {
  rpc: BridgeRpcClient
  albumId: string
  roomId?: string
  cache?: SimpleCache
  playlistIds?: string[]
  albumIds?: string[]
}): Promise<MetadataGetAlbumResult | null> {
  const albumId = params.albumId.trim()
  if (!albumId) return null

  const fetchOnce = async (): Promise<MetadataGetAlbumResult | null> => {
    if (!(await params.rpc.isPresent())) return null
    try {
      return (await params.rpc.call("getAlbum", {
        source: "local",
        albumId,
        ...(params.playlistIds?.length ? { playlistIds: params.playlistIds } : {}),
        ...(params.albumIds?.length ? { albumIds: params.albumIds } : {}),
      })) as MetadataGetAlbumResult | null
    } catch {
      return null
    }
  }

  if (!params.cache || !params.roomId) {
    return fetchOnce()
  }

  return withCachedJson({
    cache: params.cache,
    key: metadataBrowseAlbumCacheKey(
      params.roomId,
      albumId,
      params.playlistIds,
      params.albumIds,
    ),
    ttlSeconds: LOCAL_BROWSE_CACHE_TTL_SEC,
    skipCache: (value) => value == null,
    fetch: fetchOnce,
  })
}

/**
 * Full track list for a Navidrome playlist (Physical Media item), keeping the
 * failure reason so callers can tell "empty record" from "bridge not answering".
 * Successful lists are Redis-cached when `cache` + `roomId` are provided (ADR 0108).
 */
export async function fetchLocalPlaylistTracks(params: {
  rpc: BridgeRpcClient
  playlistId: string
  roomId?: string
  cache?: SimpleCache
}): Promise<LocalPlaylistTracksResult> {
  if (!params.playlistId.trim()) return { ok: false, error: "playlistId is required" }

  const fetchOnce = async (): Promise<LocalPlaylistTracksResult> => {
    if (!(await params.rpc.isPresent())) {
      return { ok: false, error: "Media Bridge is not connected" }
    }
    try {
      const result = (await params.rpc.call(
        "listPlaylistTracks",
        { source: "local", playlistId: params.playlistId },
        { timeoutMs: PLAYLIST_TRACKS_TIMEOUT_MS },
      )) as unknown
      if (!Array.isArray(result)) {
        return { ok: false, error: "Media Bridge returned no track list" }
      }
      return { ok: true, tracks: result as MetadataSourceTrack[] }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  if (!params.cache || !params.roomId) {
    return fetchOnce()
  }

  return withCachedJson({
    cache: params.cache,
    key: metadataBrowsePlaylistCacheKey(params.roomId, params.playlistId),
    ttlSeconds: LOCAL_BROWSE_CACHE_TTL_SEC,
    skipCache: (value) => !value.ok,
    fetch: fetchOnce,
  })
}

/** Fail-open variant for callers that treat an unavailable bridge as "no tracks". */
export async function listLocalPlaylistTracks(params: {
  rpc: BridgeRpcClient
  playlistId: string
}): Promise<MetadataSourceTrack[]> {
  const result = await fetchLocalPlaylistTracks(params)
  return result.ok ? result.tracks : []
}

export type LocalPlaylistTrackIdRow = { id: string; albumId?: string }

/**
 * Lean ordered track ids (+ albumId when present) for a playlist.
 * No per-track cover/tag mapping — for Physical Media de-dup. [] on old packs.
 */
export async function listLocalPlaylistTrackIds(params: {
  rpc: BridgeRpcClient
  playlistId: string
}): Promise<LocalPlaylistTrackIdRow[]> {
  const playlistId = params.playlistId.trim()
  if (!playlistId) return []
  if (!(await params.rpc.isPresent())) return []
  try {
    const result = (await params.rpc.call("listPlaylistTrackIds", {
      source: "local",
      playlistId,
    })) as unknown
    if (!Array.isArray(result)) return []
    const out: LocalPlaylistTrackIdRow[] = []
    for (const row of result) {
      if (!row || typeof row !== "object") continue
      const r = row as { id?: unknown; albumId?: unknown }
      const id = r.id != null ? String(r.id).trim() : ""
      if (!id) continue
      const albumId = r.albumId != null ? String(r.albumId).trim() : ""
      out.push(albumId ? { id, albumId } : { id })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Lean ordered track ids for an album (membership / getAlbum songs).
 * Falls back to getAlbum.tracks on old DJ Mac packs. [] on failure.
 */
export async function listLocalAlbumTrackIds(params: {
  rpc: BridgeRpcClient
  albumId: string
}): Promise<string[]> {
  const albumId = params.albumId.trim()
  if (!albumId) return []
  if (!(await params.rpc.isPresent())) return []
  try {
    const lean = (await params.rpc.call("listAlbumTrackIds", {
      source: "local",
      albumId,
    })) as unknown
    if (Array.isArray(lean)) {
      return lean.map((x) => String(x ?? "").trim()).filter(Boolean)
    }
  } catch {
    // Old pack: fall through to getAlbum
  }
  try {
    const result = (await params.rpc.call("getAlbum", {
      source: "local",
      albumId,
    })) as { tracks?: Array<{ id?: string }> } | null
    const tracks = result?.tracks
    if (!Array.isArray(tracks)) return []
    return tracks.map((t) => String(t.id ?? "").trim()).filter(Boolean)
  } catch {
    return []
  }
}

const TRACK_PREVIEW_TIMEOUT_MS = 20000

export type TrackPreviewRpcResult =
  | { ok: true; mimeType: string; data: string; durationMs: number }
  | { ok: false; error: string }

/**
 * Fetch a ~15s mid-track MP3 preview from the bridge daemon (ADR 0103).
 */
export async function fetchTrackPreview(params: {
  rpc: BridgeRpcClient
  trackId: string
}): Promise<TrackPreviewRpcResult> {
  const trackId = params.trackId.trim()
  if (!trackId) return { ok: false, error: "trackId is required" }
  if (!(await params.rpc.isPresent())) {
    return { ok: false, error: "Media Bridge is not connected" }
  }
  try {
    const result = (await params.rpc.call(
      "getTrackPreview",
      { source: "local", trackId },
      { timeoutMs: TRACK_PREVIEW_TIMEOUT_MS },
    )) as unknown
    if (!result || typeof result !== "object") {
      return { ok: false, error: "Media Bridge returned no preview data" }
    }
    const rec = result as { mimeType?: unknown; data?: unknown; durationMs?: unknown }
    const data = typeof rec.data === "string" ? rec.data : ""
    const mimeType = typeof rec.mimeType === "string" ? rec.mimeType : "audio/mpeg"
    const durationMs = typeof rec.durationMs === "number" ? rec.durationMs : 15000
    if (!data) return { ok: false, error: "Media Bridge returned empty preview data" }
    return { ok: true, mimeType, data, durationMs }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
