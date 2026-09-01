import type { QueueItem } from "@repo/types/Queue"

export type TrackRoomPresence = {
  inQueue: boolean
  alreadyPlayed: boolean
}

export function buildQueuedTrackIdSet(queue: QueueItem[]): Set<string> {
  return new Set(queue.map((item) => item.track.id))
}

export function buildPlayedTrackIdSet(playlist: QueueItem[]): Set<string> {
  return new Set(playlist.map((item) => item.track.id))
}

export function getTrackRoomPresence(
  trackId: string,
  queuedIds: Set<string>,
  playedIds: Set<string>,
): TrackRoomPresence {
  return {
    inQueue: queuedIds.has(trackId),
    alreadyPlayed: playedIds.has(trackId),
  }
}
