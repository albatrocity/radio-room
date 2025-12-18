import { AppContext, JobRegistration, JobApi, PlaybackControllerQueueItem } from "@repo/types"

/**
 * Spotify's Get User's Queue endpoint only returns up to 20 tracks.
 * We cannot safely remove tracks from the app queue when we can't see
 * the full Spotify queue, as tracks beyond position 20 would appear
 * to be "missing" even though they exist.
 */
const SPOTIFY_QUEUE_API_LIMIT = 20

/**
 * Creates a queue sync job that periodically syncs the app's queue with Spotify's queue.
 *
 * This job:
 * 1. Fetches the current Spotify queue via PlaybackController
 * 2. Compares with the app's internal queue
 * 3. Removes tracks from app queue that are no longer in Spotify's queue
 * 4. Emits QUEUE_CHANGED event if changes occurred
 *
 * This handles the case where someone removes a track from Spotify's queue
 * outside of the app (e.g., via Spotify client).
 *
 * IMPORTANT: Spotify's queue API only returns up to 20 tracks. When the queue
 * has 20+ tracks, we cannot determine which tracks beyond position 20 exist,
 * so we skip the sync to avoid incorrectly removing valid tracks.
 */
export function createQueueSyncJob(params: {
  context: AppContext
  roomId: string
  userId: string
}): JobRegistration {
  const { context, roomId, userId } = params

  return {
    name: `queue-sync-${roomId}`,
    description: `Syncs app queue with Spotify queue for room ${roomId}`,
    cron: "0 * * * * *", // Every minute (at second 0)
    enabled: true,
    runAt: Date.now(),
    handler: async ({ api }: { api: JobApi; context: AppContext }) => {
      try {
        // Dynamic imports to avoid circular dependencies
        const { getQueue, removeFromQueue } = await import("@repo/server/operations/data")
        const { AdapterService } = await import("@repo/server/services/AdapterService")

        // Get the app's current queue
        const appQueue = await getQueue({ context, roomId })
        if (appQueue.length === 0) {
          return // Nothing to sync
        }

        // Get the PlaybackController for this room
        const adapterService = new AdapterService(context)
        const playbackController = await adapterService.getRoomPlaybackController(roomId)
        if (!playbackController?.api?.getQueue) {
          return // No PlaybackController or no getQueue support
        }

        // Fetch the PlaybackController's queue
        let playbackQueueTrackIds: string[]
        try {
          const playbackQueue = await playbackController.api.getQueue()
          playbackQueueTrackIds = playbackQueue.map(
            (track: PlaybackControllerQueueItem) => track.id,
          )

          // Spotify's queue API only returns up to 20 tracks.
          // If we get 20 tracks back, we can't see the full queue and shouldn't
          // remove any tracks - they might exist beyond position 20.
          if (playbackQueueTrackIds.length >= SPOTIFY_QUEUE_API_LIMIT) {
            // We can't see the full queue, so skip sync to avoid removing valid tracks
            return
          }
        } catch (error: any) {
          console.warn(`[Queue Sync] Failed to fetch queue for room ${roomId}:`, error?.message)
          return
        }

        // Find tracks in app queue that are NOT in the PlaybackController queue
        // Safe to do this only when Spotify returns < 20 tracks (full queue visibility)
        const tracksToRemove = appQueue.filter((item) => {
          return !playbackQueueTrackIds.includes(item.mediaSource.trackId)
        })

        if (tracksToRemove.length === 0) {
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
      } catch (error: any) {
        console.error(`[Queue Sync] Error for room ${roomId}:`, error?.message || error)
      }
    },
  }
}
