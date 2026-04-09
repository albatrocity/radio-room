import type { Room } from "../types/Room"

/** Radio and live rooms expose a browser-playable stream (Shoutcast/HTTP or WebRTC/HLS). */
export function hasListenableStream(
  room: Pick<Room, "type"> | null | undefined,
): boolean {
  return !!room && (room.type === "radio" || room.type === "live")
}

export function isHybridRadioRoom(
  room: Pick<Room, "type" | "liveIngestEnabled"> | null | undefined,
): boolean {
  return !!room && room.type === "radio" && !!room.liveIngestEnabled
}
