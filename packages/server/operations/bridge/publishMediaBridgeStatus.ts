import type { AppContext } from "@repo/types"
import { presenceKey } from "@repo/adapter-bridge/protocol"

/**
 * Broadcast Media Bridge room-connection status to room clients (ADR 0080 / 0081).
 */
export async function publishMediaBridgeStatus(params: {
  context: AppContext
  roomId: string
  connected: boolean
  services?: string[]
}): Promise<void> {
  const { context, roomId, connected, services } = params
  await context.systemEvents.emit(roomId, "MEDIA_BRIDGE_STATUS_CHANGED", {
    roomId,
    connected,
    services,
  })
}

/** True when Redis room presence key is live (daemon connected to this room). */
export async function readMediaBridgeConnected(params: {
  context: AppContext
  roomId: string
}): Promise<boolean> {
  const { context, roomId } = params
  try {
    const ttl = await context.redis.pubClient.ttl(presenceKey(roomId))
    return ttl > 0
  } catch {
    return false
  }
}
