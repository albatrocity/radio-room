import { AppContext, JobApi } from "@repo/types"
import handleRoomNowPlayingData from "../operations/room/handleRoomNowPlayingData"
import { getRoomCurrent, getQueue, removeFromQueue } from "../operations/data"

/**
 * Creates a limited API for job handlers.
 * This keeps MediaSource adapters isolated from server internals.
 */
export function createJobApi(context: AppContext): JobApi {
  return {
    submitMediaData: async ({ roomId, submission, error }) => {
      await handleRoomNowPlayingData({
        context,
        roomId,
        submission,
        error,
      })
    },

    getCurrentTrackId: async (roomId: string) => {
      const current = await getRoomCurrent({ context, roomId })
      return current?.nowPlaying?.mediaSource?.trackId ?? null
    },

    submitQueueSync: async ({ roomId, mediaSourceTrackUris }) => {
      // Get the app's current queue
      const appQueue = await getQueue({ context, roomId })

      if (appQueue.length === 0) {
        // Nothing to sync
        return { changed: false, removedCount: 0 }
      }

      // Find tracks in app queue that are NOT in the MediaSource queue
      // We need to match by Spotify URI format: spotify:track:{trackId}
      const tracksToRemove = appQueue.filter((item) => {
        // Build the expected URI for this track
        const trackUri = `spotify:track:${item.mediaSource.trackId}`
        return !mediaSourceTrackUris.includes(trackUri)
      })

      if (tracksToRemove.length === 0) {
        return { changed: false, removedCount: 0 }
      }

      // Remove tracks that are no longer in MediaSource queue
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

      return { changed: true, removedCount: tracksToRemove.length }
    },
  }
}
