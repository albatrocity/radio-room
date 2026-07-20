import type {
  MetadataSourceAdapter,
  MetadataSourceAdapterConfig,
  MetadataSourceApi,
  MetadataSourceTrack,
} from "@repo/types"
import type { AppContext } from "@repo/types"
import { BridgeRpcClient } from "./rpcClient"
import { emptyAlbum, emptyArtist } from "./trackHelpers"

/**
 * Local metadata source — search is RPC to the connected bridge daemon.
 * findById synthesizes a minimal track when daemon is absent (queue hydration).
 */
export function createLocalMetadataApi(deps: {
  getRpcForRoom: (roomId: string) => BridgeRpcClient | null
  /** Room id closed over at register time when available; otherwise RPC uses first present room. */
  roomId?: string
}): MetadataSourceApi {
  async function searchViaDaemon(query: string): Promise<MetadataSourceTrack[]> {
    const roomId = deps.roomId
    if (!roomId) return []
    const rpc = deps.getRpcForRoom(roomId)
    if (!rpc || !(await rpc.isPresent())) return []
    const result = (await rpc.call("search", { query, source: "local" })) as MetadataSourceTrack[]
    return Array.isArray(result) ? result : []
  }

  return {
    async search(query: string) {
      return searchViaDaemon(query)
    },
    async searchByParams(params) {
      const artist = params.artists?.[0]?.title ?? ""
      return searchViaDaemon([params.title, artist].filter(Boolean).join(" "))
    },
    async findById(id: string) {
      // Prefer live search hit; otherwise synthesize a playable local resource stub
      const results = await searchViaDaemon(id)
      const hit = results.find((t) => t.id === id)
      if (hit) return hit
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
