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

/** List Navidrome playlists on the connected bridge daemon (admin shelf picker). */
export async function listLocalPlaylists(params: {
  rpc: BridgeRpcClient
}): Promise<Array<{ id: string; name: string; songCount?: number }>> {
  if (!(await params.rpc.isPresent())) return []
  try {
    const result = (await params.rpc.call("listPlaylists", {
      source: "local",
    })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .map((row) => {
        if (!row || typeof row !== "object") return null
        const r = row as Record<string, unknown>
        const id = r.id != null ? String(r.id) : ""
        if (!id) return null
        return {
          id,
          name: r.name != null ? String(r.name) : id,
          ...(typeof r.songCount === "number" ? { songCount: r.songCount } : {}),
        }
      })
      .filter((x): x is { id: string; name: string; songCount?: number } => x != null)
  } catch {
    return []
  }
}
