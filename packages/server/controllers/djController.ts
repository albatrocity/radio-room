import { Server } from "socket.io"
import { SocketWithContext } from "../lib/socketWithContext"
import { createDJHandlers } from "../handlers/djHandlersAdapter"
import { User, QueueItem } from "@repo/types"

/**
 * DJ Controller - Manages DJ-related socket events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createDJController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createDJHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Deputize or undeputize a user as a DJ
   */
  socket.on("DEPUTIZE_DJ", async (userId: User["userId"]) => {
    await handlers.djDeputizeUser(connections, userId)
  })

  /**
   * Add a song to the playback queue
   */
  socket.on("QUEUE_SONG", async (trackId: QueueItem["track"]["id"]) => {
    await handlers.queueSong(connections, trackId)
  })

  /**
   * Search for tracks using the room's configured metadata source
   */
  socket.on("SEARCH_TRACK", async (query: { query: string }) => {
    await handlers.searchForTrack(connections, query)
  })

  /**
   * Legacy event name for backward compatibility
   * @deprecated Use "SEARCH_TRACK" instead
   */
  socket.on("SEARCH_SPOTIFY_TRACK", async (query: { query: string }) => {
    await handlers.searchForTrack(connections, query)
  })

  /**
   * Save a playlist to the room's configured metadata source
   */
  socket.on(
    "SAVE_PLAYLIST",
    async ({
      name,
      trackIds,
      targetService,
      roomId,
    }: {
      name: string
      trackIds: QueueItem["track"]["id"][]
      targetService?: string
      roomId?: string
    }) => {
      await handlers.savePlaylist(connections, { name, trackIds, targetService, roomId })
    },
  )

  /**
   * Check if tracks are saved in user's library
   * Accepts either legacy format (string[]) or new format ({ trackIds, targetService })
   */
  socket.on(
    "CHECK_SAVED_TRACKS",
    async (payload: string[] | { trackIds: string[]; targetService?: string }) => {
      // Support both legacy array format and new object format
      const trackIds = Array.isArray(payload) ? payload : payload.trackIds
      const targetService = Array.isArray(payload) ? undefined : payload.targetService
      console.log("[djController] CHECK_SAVED_TRACKS received:", { trackIds, targetService })
      await handlers.checkSavedTracks(connections, { trackIds, targetService })
    },
  )

  /**
   * Add tracks to user's library
   * Accepts either legacy format (string[]) or new format ({ trackIds, targetService })
   */
  socket.on(
    "ADD_TO_LIBRARY",
    async (payload: string[] | { trackIds: string[]; targetService?: string }) => {
      const trackIds = Array.isArray(payload) ? payload : payload.trackIds
      const targetService = Array.isArray(payload) ? undefined : payload.targetService
      console.log("[djController] ADD_TO_LIBRARY received:", { trackIds, targetService })
      await handlers.addToLibrary(connections, { trackIds, targetService })
    },
  )

  /**
   * Remove tracks from user's library
   * Accepts either legacy format (string[]) or new format ({ trackIds, targetService })
   */
  socket.on(
    "REMOVE_FROM_LIBRARY",
    async (payload: string[] | { trackIds: string[]; targetService?: string }) => {
      const trackIds = Array.isArray(payload) ? payload : payload.trackIds
      const targetService = Array.isArray(payload) ? undefined : payload.targetService
      await handlers.removeFromLibrary(connections, { trackIds, targetService })
    },
  )

  socket.on("GET_SAVED_TRACKS", async () => {
    await handlers.getSavedTracks(connections)
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createDJController instead
 */
export default createDJController
