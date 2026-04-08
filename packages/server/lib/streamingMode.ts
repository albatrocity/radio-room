import type { Room } from "@repo/types/Room"
import { hasListenableStream } from "./roomTypeHelpers"

/**
 * A stream-backed room with track detection disabled enters "streaming mode":
 * no track processing, no playlist accumulation, room-branding display only.
 */
export function isStreamingMode(room: Pick<Room, "fetchMeta" | "type"> | null | undefined): boolean {
  return !!room && !room.fetchMeta && hasListenableStream(room)
}

export function isTrackDetectionEnabled(room: Pick<Room, "fetchMeta"> | null | undefined): boolean {
  return !!room?.fetchMeta
}

type DisplayFields = Pick<Room, "title" | "artwork" | "showSchedulePublic" | "activeSegmentId">

/**
 * Returns true when any field that affects the streaming-mode display
 * differs between two room snapshots.
 */
export function streamingDisplayChanged(
  previous: Partial<DisplayFields>,
  next: Partial<DisplayFields>,
): boolean {
  return (
    previous.title !== next.title ||
    previous.artwork !== next.artwork ||
    previous.showSchedulePublic !== next.showSchedulePublic ||
    previous.activeSegmentId !== next.activeSegmentId
  )
}
