import type { AppContext } from "@repo/types"
import { findRoom, clearRoomCurrent } from "../data"
import { hasListenableStream, isHybridRadioRoom } from "../../lib/roomTypeHelpers"

type HandleStreamHealthParams = {
  context: AppContext
  roomId: string
  status: "online" | "offline"
}

const STREAM_HEALTH_KEY = (roomId: string) => `room:${roomId}:streamHealth`
const STREAM_HEALTH_WEBRTC_KEY = (roomId: string) => `room:${roomId}:streamHealth:webrtc`

/**
 * Updates stream health from the MediaMTX webhook (runOnReady / runOnNotReady).
 *
 * - `live` rooms: primary path; offline clears `room:current`.
 * - Hybrid `radio` + `liveIngestEnabled`: WebRTC-only path; does **not** clear Shoutcast-driven Now Playing.
 */
export default async function handleStreamHealth({
  context,
  roomId,
  status,
}: HandleStreamHealthParams) {
  const room = await findRoom({ context, roomId })
  if (!room || !hasListenableStream(room)) return

  const sourceType = room.type as "radio" | "live"
  const hybrid = isHybridRadioRoom(room)

  const persistKey = hybrid ? STREAM_HEALTH_WEBRTC_KEY(roomId) : STREAM_HEALTH_KEY(roomId)
  await context.redis.pubClient.set(persistKey, status)

  if (status === "offline" && !hybrid) {
    await clearRoomCurrent({ context, roomId })
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "STREAM_HEALTH_CHANGED", {
      roomId,
      status,
      ...(hybrid ? { ingest: "webrtc_experimental" as const } : {}),
    })

    await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId,
      status,
      sourceType,
      ...(hybrid ? { streamTransport: "webrtc" as const } : {}),
    })
  }
}

/**
 * Read the persisted stream health status for a room.
 * Returns "online" | "offline" | null (null = never reported).
 */
export async function getStreamHealthStatus(
  context: AppContext,
  roomId: string,
): Promise<"online" | "offline" | null> {
  const val = await context.redis.pubClient.get(STREAM_HEALTH_KEY(roomId))
  if (val === "online" || val === "offline") return val
  return null
}

/**
 * Persisted WebRTC path health for hybrid radio rooms (`liveIngestEnabled`).
 */
export async function getWebrtcExperimentalStreamHealthStatus(
  context: AppContext,
  roomId: string,
): Promise<"online" | "offline" | null> {
  const val = await context.redis.pubClient.get(STREAM_HEALTH_WEBRTC_KEY(roomId))
  if (val === "online" || val === "offline") return val
  return null
}
