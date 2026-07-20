import type {
  AppContext,
  PlaybackController,
  PlaybackControllerAdapter,
  PlaybackControllerLifecycleCallbacks,
} from "@repo/types"
import { ActiveSourceStore } from "./lib/activeSource"
import {
  dropCapabilityCache,
  getOrCreateCapabilityCache,
} from "./lib/capability"
import { createBridgeAdvanceJob } from "./lib/bridgeAdvance"
import { createBridgePlaybackApi } from "./lib/playbackControllerApi"
import { BridgeRpcClient } from "./lib/rpcClient"

export {
  bridgeRequestSchema,
  bridgeResponseSchema,
  bridgeEventSchema,
  lastEndedKey,
  spotifyTokenKey,
  spotifyDeviceKey,
} from "./lib/protocol"
export type { BridgeRequest, BridgeResponse, BridgeEvent, BridgeSource } from "./lib/protocol"
export {
  requestChannel,
  responseChannel,
  eventChannel,
  presenceKey,
  BRIDGE_RPC_TIMEOUT_MS,
  BRIDGE_PRESENCE_TTL_SEC,
  BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
} from "./lib/protocol"
export { parseBridgeMediaId } from "./lib/parseBridgeMediaId"
export { youtubeMetadataSource, createYoutubeMetadataApi } from "./lib/youtubeMetadata"
export { localMetadataSource, registerLocalMetadataForRoom } from "./lib/localMetadata"
export { BridgeRpcClient } from "./lib/rpcClient"
export { getOrCreateCapabilityCache } from "./lib/capability"

const roomRpcClients = new Map<string, BridgeRpcClient>()

export function getBridgeRpcClient(roomId: string): BridgeRpcClient | undefined {
  return roomRpcClients.get(roomId)
}

export const playbackController: PlaybackControllerAdapter = {
  register: async (config: PlaybackControllerLifecycleCallbacks): Promise<PlaybackController> => {
    const { name, authentication, roomId, onRegistered, onError } = config

    if (!roomId) {
      // Composition-root registration (no room yet) — return a stub that fails until room-scoped register
      const stubApi = createBridgePlaybackApi({
        roomId: "__unbound__",
        rpc: {
          call: async () => {
            throw new Error("Bridge controller not bound to a room")
          },
          notify: async () => {},
          isPresent: async () => false,
          start: async () => {},
          stop: async () => {},
        } as unknown as BridgeRpcClient,
        getSpotifyDelegate: async () => null,
        activeSource: {
          get: async () => null,
          set: async () => {},
          clear: async () => {},
          getLastVolume: async () => null,
          setLastVolume: async () => {},
        } as unknown as ActiveSourceStore,
      })
      await onRegistered?.({ api: stubApi, name })
      return { name, authentication, api: stubApi }
    }

    try {
      // Room-scoped register is driven from AdapterService with context redis
      throw new Error(
        "Bridge room-scoped register must use registerBridgeForRoom (AdapterService)",
      )
    } catch (error) {
      await onError?.(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  },

  onRoomCreated: async ({ roomId, userId, context }) => {
    console.log(`[bridge] onRoomCreated ${roomId}`)
    if (!context.jobService) return

    const { AdapterService } = await import("@repo/server/services/AdapterService")
    const adapterService = new AdapterService(context)
    const controller = await adapterService.getRoomPlaybackController(roomId)
    if (!controller) {
      console.warn(`[bridge] No playback controller for room ${roomId}; advance job not registered`)
      return
    }

    const redis = context.redis.pubClient
    const capability = getOrCreateCapabilityCache(redis, roomId)
    await capability.start()

    // Ensure Spotify SDK token provisioning is live even if the controller
    // was cached from a prior register without the wire-up.
    const { wireSpotifyTokenProvisioning } = await import("./lib/spotifyTokenProvisioner")
    wireSpotifyTokenProvisioning({
      context,
      roomId,
      onEvent: (listener) => capability.onEvent(listener),
    })

    const activeSource = new ActiveSourceStore(redis, roomId)
    const job = createBridgeAdvanceJob({
      context,
      roomId,
      userId,
      playTrack: (uri) => controller.api.playTrack(uri),
      getPlaybackApi: async () => {
        // Re-resolve so we don't close over a stale controller after reconnect
        const fresh = await adapterService.getRoomPlaybackController(roomId)
        return fresh?.api ?? controller.api
      },
      capability,
      clearActiveSource: () => activeSource.clear(),
    })

    // Always replace so ENDED/stuck handlers stay bound to a live capability + playTrack
    context.jobService.disableJob(job.name)
    const idx = context.jobs.findIndex((j) => j.name === job.name)
    if (idx >= 0) context.jobs.splice(idx, 1)
    await context.jobService.scheduleJob(job)
    console.log(`[bridge] Registered ${job.name}`)
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`[bridge] onRoomDeleted ${roomId}`)
    if (context.jobService) {
      context.jobService.disableJob(`bridge-player-${roomId}`)
    }
    const rpc = roomRpcClients.get(roomId)
    if (rpc) {
      await rpc.stop()
      roomRpcClients.delete(roomId)
    }
    const { dropSpotifyTokenProvisioning } = await import("./lib/spotifyTokenProvisioner")
    dropSpotifyTokenProvisioning(roomId)
    dropCapabilityCache(roomId)
  },
}

/**
 * Create a fully wired bridge PlaybackController for a room.
 * Called from AdapterService when playbackControllerId === "bridge".
 */
export async function registerBridgeForRoom(params: {
  roomId: string
  context: AppContext
  authentication: PlaybackControllerLifecycleCallbacks["authentication"]
  lifecycle: Omit<PlaybackControllerLifecycleCallbacks, "name" | "authentication" | "roomId">
}): Promise<PlaybackController> {
  const { roomId, context, authentication, lifecycle } = params
  const redis = context.redis.pubClient

  let rpc = roomRpcClients.get(roomId)
  if (!rpc) {
    rpc = new BridgeRpcClient(redis, roomId)
    await rpc.start()
    roomRpcClients.set(roomId, rpc)
  }

  const activeSource = new ActiveSourceStore(redis, roomId)
  const capability = getOrCreateCapabilityCache(redis, roomId)
  await capability.start()

  const { wireSpotifyTokenProvisioning } = await import("./lib/spotifyTokenProvisioner")
  wireSpotifyTokenProvisioning({
    context,
    roomId,
    onEvent: (listener) => capability.onEvent(listener),
  })

  const { AdapterService } = await import("@repo/server/services/AdapterService")
  const adapterService = new AdapterService(context)

  const api = createBridgePlaybackApi({
    roomId,
    rpc,
    activeSource,
    getSpotifyDelegate: async () => {
      const ctrl = await adapterService.getRoomPlaybackControllerByService(roomId, "spotify")
      return ctrl?.api ?? null
    },
    getPlayMeta: async () => {
      try {
        const { getDispatchedTrack } = await import("@repo/server/operations/data")
        const item = await getDispatchedTrack({ context, roomId })
        if (!item) return null
        return {
          title: item.track.title,
          artist: item.track.artists?.map((a) => a.title).join(", "),
          album: item.track.album?.title,
        }
      } catch {
        return null
      }
    },
  })

  await lifecycle.onRegistered?.({ api, name: "bridge" })

  return {
    name: "bridge",
    authentication,
    api,
  }
}
