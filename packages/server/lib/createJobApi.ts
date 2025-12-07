import { AppContext, JobApi } from "@repo/types"
import handleRoomNowPlayingData from "../operations/room/handleRoomNowPlayingData"
import { getRoomCurrent } from "../operations/data"

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
  }
}
