import type { Namespace } from "socket.io"
import { emitToDeviceSockets } from "@repo/adapter-bridge"

/** Socket.IO room on `/device`. The Redis adapter delivers across API processes. */
const SEGMENT_ROOM_PREFIX = "segment:"

let deviceNamespace: Namespace | null = null

export function deviceSegmentRoom(roomId: string): string {
  return `${SEGMENT_ROOM_PREFIX}${roomId}`
}

export function bindDeviceNamespace(namespace: Namespace): void {
  deviceNamespace = namespace
}

export function resetDeviceNamespaceForTests(): void {
  deviceNamespace = null
}

/**
 * Push a segment cue to every `/device` socket watching this room.
 * Uses the namespace room when the server is up so another API process can
 * deliver it. Tests that never attach the namespace fall back to the
 * in-process socket map.
 */
export function emitDeviceSegment(roomId: string, payload: unknown): void {
  if (deviceNamespace) {
    deviceNamespace.to(deviceSegmentRoom(roomId)).emit("segment", payload)
    return
  }
  emitToDeviceSockets(roomId, "segment", payload)
}
