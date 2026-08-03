import type { AppContext } from "@repo/types"
import { findRoom, isRoomAdmin } from "../operations/data"
import {
  publishMediaBridgeStatus,
  readMediaBridgeConnected,
} from "../operations/bridge/publishMediaBridgeStatus"

/**
 * Media Bridge link + presence for bridge playback rooms (ADR 0082 / 0083).
 * Socket handlers stay thin; Redis RPC lives in @repo/adapter-bridge.
 */
export class MediaBridgeService {
  constructor(private readonly context: AppContext) {}

  /**
   * Ask an online Media Bridge daemon to connect to this room (Redis BRIDGE:CONTROL).
   * Room admin + playbackControllerId === "bridge" only.
   */
  async linkMediaBridge(roomId: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { success: false as const, message: "Room not found" }
    }

    const allowed = await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
    if (!allowed) {
      return { success: false as const, message: "Not authorized to link Media Bridge" }
    }

    if (room.playbackControllerId !== "bridge") {
      return {
        success: false as const,
        message: "This room is not configured to use the Media Bridge",
      }
    }

    try {
      const { requestBridgeLink } = await import("@repo/adapter-bridge")
      const result = await requestBridgeLink({
        redis: this.context.redis.pubClient as any,
        roomId,
      })
      if (!result.ok) {
        return { success: false as const, message: result.error }
      }
      try {
        let services: string[] | undefined
        try {
          const { getOrCreateCapabilityCache } = await import("@repo/adapter-bridge")
          const capability = getOrCreateCapabilityCache(this.context.redis.pubClient, roomId)
          await capability.start()
          services = Array.from(capability.getAvailableServices())
        } catch {
          /* optional */
        }
        await publishMediaBridgeStatus({
          context: this.context,
          roomId,
          connected: true,
          services,
        })
      } catch (e) {
        console.warn("[MediaBridgeService.linkMediaBridge] status publish failed:", e)
      }
      return {
        success: true as const,
        daemonId: result.daemonId,
        roomId: result.roomId,
      }
    } catch (e) {
      console.error("[MediaBridgeService.linkMediaBridge] failed:", e)
      return {
        success: false as const,
        message: "Failed to link Media Bridge",
      }
    }
  }

  /**
   * Room-scoped Media Bridge presence (daemon connected to this room).
   */
  async getMediaBridgeStatus(roomId: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { success: false as const, message: "Room not found" }
    }

    // Read-only presence for any room member (search tabs / capability UX).
    // Link remains admin-gated in linkMediaBridge.
    if (!userId) {
      return { success: false as const, message: "Not authorized" }
    }

    if (room.playbackControllerId !== "bridge") {
      return {
        success: true as const,
        connected: false,
        services: undefined as string[] | undefined,
        roomId,
      }
    }

    const connected = await readMediaBridgeConnected({
      context: this.context,
      roomId,
    })

    let services: string[] | undefined
    try {
      const { getOrCreateCapabilityCache } = await import("@repo/adapter-bridge")
      const capability = getOrCreateCapabilityCache(this.context.redis.pubClient, roomId)
      await capability.start()
      // Only expose services after CAPABILITIES — empty array means "none enabled"
      if (capability.hasReceivedCapabilities()) {
        services = Array.from(capability.getAvailableServices())
      }
    } catch (e) {
      console.warn("[MediaBridgeService.getMediaBridgeStatus] capability read failed:", e)
    }

    return { success: true as const, connected, services, roomId }
  }
}
