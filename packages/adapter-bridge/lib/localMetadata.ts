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
} from "@repo/types"
import type { AppContext } from "@repo/types"
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
    playlistIds?: string[],
  ): Promise<MetadataSourceTrack[]> {
    return withRpc(async (rpc) => {
      const result = (await rpc.call("search", {
        query,
        source: "local",
        ...(playlistIds?.length ? { playlistIds } : {}),
      })) as MetadataSourceTrack[]
      return Array.isArray(result) ? result : []
    }, [])
  }

  return {
    async search(query: string, options?: { playlistIds?: string[] }) {
      return searchViaDaemon(query, options?.playlistIds)
    },
    async searchByParams(params) {
      const artist = params.artists?.[0]?.title ?? ""
      return searchViaDaemon([params.title, artist].filter(Boolean).join(" "))
    },
    async findById(id: string, options?: { playlistIds?: string[] }) {
      const fromDaemon = await withRpc(async (rpc) => {
        try {
          const track = (await rpc.call("getTrack", {
            source: "local",
            trackId: id,
            ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
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
        })) as MetadataListAlbumsResult
        return result?.items ? result : { items: [], total: 0 }
      }, { items: [], total: 0 })
    },
    async getArtist(
      artistId: string,
      options?: { playlistIds?: string[] },
    ): Promise<MetadataGetArtistResult | null> {
      return withRpc(async (rpc) => {
        return (await rpc.call("getArtist", {
          source: "local",
          artistId,
          ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
        })) as MetadataGetArtistResult | null
      }, null)
    },
    async getAlbum(
      albumId: string,
      options?: { playlistIds?: string[] },
    ): Promise<MetadataGetAlbumResult | null> {
      return withRpc(async (rpc) => {
        return (await rpc.call("getAlbum", {
          source: "local",
          albumId,
          ...(options?.playlistIds?.length ? { playlistIds: options.playlistIds } : {}),
        })) as MetadataGetAlbumResult | null
      }, null)
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
  })
  return {
    name: "local",
    authentication: params.authentication,
    api,
  }
}

/** Ask the daemon which of the given Navidrome playlist ids contain a local track. */
export async function checkLocalTrackPlaylistMembership(params: {
  rpc: BridgeRpcClient
  trackId: string
  playlistIds: string[]
}): Promise<string[]> {
  if (!params.trackId || params.playlistIds.length === 0) return []
  if (!(await params.rpc.isPresent())) return []
  try {
    const result = (await params.rpc.call("checkPlaylistMembership", {
      source: "local",
      trackId: params.trackId,
      playlistIds: params.playlistIds,
    })) as unknown
    return Array.isArray(result) ? result.map(String) : []
  } catch {
    return []
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
 * Full track list for a Navidrome playlist (Physical Media item), keeping the
 * failure reason so callers can tell "empty record" from "bridge not answering".
 */
export async function fetchLocalPlaylistTracks(params: {
  rpc: BridgeRpcClient
  playlistId: string
}): Promise<LocalPlaylistTracksResult> {
  if (!params.playlistId.trim()) return { ok: false, error: "playlistId is required" }
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

/** Fail-open variant for callers that treat an unavailable bridge as "no tracks". */
export async function listLocalPlaylistTracks(params: {
  rpc: BridgeRpcClient
  playlistId: string
}): Promise<MetadataSourceTrack[]> {
  const result = await fetchLocalPlaylistTracks(params)
  return result.ok ? result.tracks : []
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
