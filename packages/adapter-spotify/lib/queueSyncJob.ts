import { AppContext, JobRegistration, JobApi, PlaybackControllerQueueItem } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"

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
        } catch (error: any) {
          console.warn(`[Queue Sync] Failed to fetch queue for room ${roomId}:`, error?.message)
          return
        }

        // Find tracks in app queue that are NOT in the PlaybackController queue
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
