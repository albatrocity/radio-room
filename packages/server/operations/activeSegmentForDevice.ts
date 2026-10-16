import type { AppContext, Room } from "@repo/types"
import { findRoom } from "./data"
import { readRoomScheduleSnapshot } from "./scheduleRedisSnapshot"

export type DeviceSegmentPayload = {
  roomId: string
  showId: string
  segmentId: string
  segmentTitle: string
}

export type DeviceSegmentRead =
  | { status: "missing" }
  | { status: "inactive"; showId: string }
  | { status: "active"; payload: DeviceSegmentPayload }

/**
 * Segment snapshot for device HTTP and the `/device` join push.
 * `missing` is an unknown room (HTTP 404). `inactive` is a room with no segment (HTTP 204).
 */
export async function readDeviceSegment(
  context: AppContext,
  roomId: string,
): Promise<DeviceSegmentRead> {
  const room = await findRoom({ context, roomId })
  if (!room) return { status: "missing" }
  if (!room.activeSegmentId) {
    return { status: "inactive", showId: room.showId ?? "" }
  }
  return { status: "active", payload: await segmentPayload(context, room) }
}

/** Current segment for a device socket snapshot. Empty `segmentId` means none is active. */
export async function activeSegmentForDevice(context: AppContext, roomId: string) {
  const read = await readDeviceSegment(context, roomId)
  if (read.status === "active") {
    return { ...read.payload, at: Date.now() }
  }
  return {
    roomId,
    showId: read.status === "inactive" ? read.showId : "",
    segmentId: "",
    segmentTitle: "",
    at: Date.now(),
  }
}

async function segmentPayload(context: AppContext, room: Room): Promise<DeviceSegmentPayload> {
  let segmentTitle = ""
  let showId = room.showId ?? ""
  try {
    const snapshot = await readRoomScheduleSnapshot(context, room.id)
    if (snapshot?.showId) showId = snapshot.showId
    const match = snapshot?.segments.find((segment) => segment.segmentId === room.activeSegmentId)
    if (match?.segment?.title) segmentTitle = match.segment.title
  } catch (error) {
    console.warn(`[device] active segment snapshot failed for ${room.id}:`, error)
  }
  return {
    roomId: room.id,
    showId,
    segmentId: room.activeSegmentId ?? "",
    segmentTitle,
  }
}
