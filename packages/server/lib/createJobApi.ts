import { AppContext, JobApi } from "@repo/types"
import handleRoomNowPlayingData from "../operations/room/handleRoomNowPlayingData"

/**
 * Creates a limited API for job handlers.
 * This keeps MediaSource adapters isolated from server internals.
 */
export function createJobApi(context: AppContext): JobApi {
  return {
    submitMediaData: async ({ roomId, data, error }) => {
      await handleRoomNowPlayingData({
        context,
        roomId,
        data,
        error,
      })
    },
  }
}

