import type { AppContext } from "@repo/types"
import type { BridgeCapabilityCache } from "./capability"

const wiredRooms = new Set<string>()

/**
 * Publish MEDIA_BRIDGE_STATUS_CHANGED when the daemon connects/disconnects.
 * Idempotent per roomId for the life of the process.
 */
export function wireMediaBridgeStatusBroadcast(params: {
  context: AppContext
  roomId: string
  capability: BridgeCapabilityCache
}): void {
  const { context, roomId, capability } = params
  if (wiredRooms.has(roomId)) return
  wiredRooms.add(roomId)

  const publish = async () => {
    try {
      const { publishMediaBridgeStatus } = await import(
        "@repo/server/operations/bridge/publishMediaBridgeStatus"
      )
      await publishMediaBridgeStatus({
        context,
        roomId,
        connected: capability.isConnected(),
        services: Array.from(capability.getAvailableServices()),
      })
    } catch (e) {
      console.warn(`[bridge] status publish failed for ${roomId}:`, e)
    }
  }

  capability.onCapabilities(() => {
    void publish()
  })

  // Seed current presence (CAPABILITIES may already have fired before we subscribed)
  void publish()
}

export function dropMediaBridgeStatusWire(roomId: string): void {
  wiredRooms.delete(roomId)
}
