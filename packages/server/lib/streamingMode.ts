import type { Room } from "@repo/types/Room"
import { hasListenableStream } from "./roomTypeHelpers"

/**
 * A stream-backed room with track detection disabled enters "streaming mode":
 * no track processing, no playlist accumulation, room-branding display only.
 */
export function isStreamingMode(
  room: Pick<Room, "fetchMeta" | "type"> | null | undefined,
): boolean {
  return !!room && !room.fetchMeta && hasListenableStream(room)
}

export function isTrackDetectionEnabled(room: Pick<Room, "fetchMeta"> | null | undefined): boolean {
  return !!room?.fetchMeta
}

/** Placeholder media id written by `enterStreamingMode`. Not a catalog track. */
export const STREAMING_MODE_TRACK_ID = "streaming-mode"

/**
 * Cover the public lobby should mask into the logo while track detection is off.
 * `artwork` is the streaming-mode Now Playing cover: the active segment image,
 * or room artwork when the segment has none (ADR 0195).
 */
export function streamingCoverUrl(
  room: Pick<Room, "fetchMeta" | "type"> | null | undefined,
  artwork: string | null | undefined,
): string | null {
  if (!isStreamingMode(room)) return null
  const url = artwork?.trim()
  return url ? url : null
}

type DisplayFields = Pick<Room, "title" | "artwork" | "activeSegmentId">

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
    previous.activeSegmentId !== next.activeSegmentId
  )
}
