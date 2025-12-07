import { AppContext, PlaybackControllerQueueItem, QueueItem } from "@repo/types"
import { findRoom, getQueue, removeFromQueue } from "../../operations/data"
import { AdapterService } from "../../services/AdapterService"

// Track last sync time per room to throttle syncs
const lastQueueSyncTime: Map<string, number> = new Map()
const QUEUE_SYNC_INTERVAL_MS = 60 * 1000 // 60 seconds

/**
 * Syncs a room's app queue with the PlaybackController's queue.
 *
 * This runs as part of the rooms job and checks if any app-queued tracks
 * have been removed from the PlaybackController's queue (e.g., Spotify).
 * If so, they are removed from the app's queue and a QUEUE_CHANGED event is emitted.
 */
export async function syncQueue(context: AppContext, roomId: string) {
  // Check throttle
  const lastSync = lastQueueSyncTime.get(roomId) ?? 0
  const now = Date.now()
  if (now - lastSync < QUEUE_SYNC_INTERVAL_MS) {
    return // Skip - synced recently
  }

  try {
    // Get the room to find the creator
    const room = await findRoom({ context, roomId })
    if (!room) {
      return
    }

    // Get the app's current queue
    const appQueue = await getQueue({ context, roomId })
    if (appQueue.length === 0) {
      // Nothing to sync
      lastQueueSyncTime.set(roomId, now)
      return
    }

    // Get the PlaybackController for this room
    const adapterService = new AdapterService(context)
    const playbackController = await adapterService.getRoomPlaybackController(roomId)
    if (!playbackController?.api?.getQueue) {
      // No PlaybackController or no getQueue support
      lastQueueSyncTime.set(roomId, now)
      return
    }

    // Fetch the PlaybackController's queue (returns MetadataSourceTrack[])
    let playbackQueueTrackIds: string[]
    try {
      const playbackQueue = await playbackController.api.getQueue()
      // Extract track IDs from the queue items
      playbackQueueTrackIds = playbackQueue.map((track: PlaybackControllerQueueItem) => track.id)
    } catch (error: any) {
      // Queue fetch failed - skip this sync
      console.warn(`[Queue Sync] Failed to fetch queue for room ${roomId}:`, error?.message)
      return
    }

    // Find tracks in app queue that are NOT in the PlaybackController queue
    const tracksToRemove = appQueue.filter((item: QueueItem) => {
      // Compare track IDs directly
      return !playbackQueueTrackIds.includes(item.mediaSource.trackId)
    })

    if (tracksToRemove.length === 0) {
      lastQueueSyncTime.set(roomId, now)
      return
    }

    // Remove tracks that are no longer in PlaybackController queue
    for (const item of tracksToRemove) {
      const trackKey = `${item.mediaSource.type}:${item.mediaSource.trackId}`
      await removeFromQueue({ context, roomId, trackId: trackKey })
    }

    // Emit QUEUE_CHANGED event
    if (context.systemEvents) {
      const updatedQueue = await getQueue({ context, roomId })
      await context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
        roomId,
        queue: updatedQueue,
      })
    }

    console.log(
      `[Queue Sync] Room ${roomId}: Removed ${tracksToRemove.length} tracks no longer in playback queue`,
    )

    lastQueueSyncTime.set(roomId, now)
  } catch (error: any) {
    console.error(`[Queue Sync] Error for room ${roomId}:`, error?.message || error)
  }
}
