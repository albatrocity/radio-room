import type { QueueItem, User } from "@repo/types"
import type { MockPluginLifecycle } from "./mockLifecycle"
import type { StudioRoom } from "./studioRoom"
/**
 * Realistic Spotify queue rows sourced from `room-dump.json` (playlist snapshot).
 * Used as defaults for Game Studio + studio-bridge preview (Now Playing / queue).
 */
import rawSamples from "./sampleQueueTracks.json"

const templates = rawSamples as QueueItem[]

export function getSampleQueueTemplates(): QueueItem[] {
  return templates
}

export function cloneSampleQueueItem(
  template: QueueItem,
  opts: { addedBy?: User; addedAt?: number },
): QueueItem {
  return {
    ...template,
    addedAt: opts.addedAt ?? Date.now(),
    playedAt: null,
    addedBy: opts.addedBy,
    locked: undefined,
  }
}

/**
 * Optional: fill an empty queue with sample tracks (e.g. for a dev tool or test).
 * Bootstrap does not call this — add tracks via UI actions or persist a snapshot instead.
 */
export async function seedStudioSampleQueueIfEmpty(
  room: StudioRoom,
  lifecycle: MockPluginLifecycle,
): Promise<void> {
  if (room.queue.length > 0) return
  const firstUser = room.users.values().next().value as User | undefined
  const addedBy =
    firstUser != null
      ? { userId: firstUser.userId, username: firstUser.username ?? firstUser.userId }
      : undefined
  let addedAt = Date.now()
  for (const template of templates) {
    const item = cloneSampleQueueItem(template, { addedAt: addedAt++, addedBy })
    room.queue.push(item)
    await lifecycle.emit("PLAYLIST_TRACK_ADDED", { roomId: room.roomId, track: item })
  }
  room.logEvent("QUEUE_SEED_SAMPLES", { count: templates.length })
  room.notify()
}
