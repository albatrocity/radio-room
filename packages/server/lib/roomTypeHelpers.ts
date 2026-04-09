import type { Room } from "@repo/types/Room"

/**
 * Returns true for room types that provide an audio stream
 * for listeners to play in the browser (radio and live rooms).
 */
export function hasListenableStream(
  room: Pick<Room, "type"> | null | undefined,
): boolean {
  return !!room && (room.type === "radio" || room.type === "live")
}

/**
 * `radio` room with optional experimental WebRTC/RTMP listen path enabled.
 */
export function isHybridRadioRoom(
  room: Pick<Room, "type" | "liveIngestEnabled"> | null | undefined,
): boolean {
  return !!room && room.type === "radio" && !!room.liveIngestEnabled
}
