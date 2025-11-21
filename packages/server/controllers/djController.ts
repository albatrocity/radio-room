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
  socket.on("dj deputize user", async (userId: User["userId"]) => {
    await handlers.djDeputizeUser(connections, userId)
  })

  /**
   * Add a song to the playback queue
   */
  socket.on("queue song", async (trackId: QueueItem["track"]["id"]) => {
    await handlers.queueSong(connections, trackId)
  })

  /**
   * Search for tracks using the room's configured metadata source
   */
  socket.on("search track", async (query: { query: string }) => {
    await handlers.searchForTrack(connections, query)
  })

  /**
   * Legacy event name for backward compatibility
   * @deprecated Use "search track" instead
   */
  socket.on("search spotify track", async (query: { query: string }) => {
    await handlers.searchForTrack(connections, query)
  })

  /**
   * Save a playlist to the room's configured metadata source
   */
  socket.on(
    "save playlist",
    async ({ name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"][] }) => {
      await handlers.savePlaylist(connections, { name, trackIds })
    },
  )

  /**
   * Check if tracks are saved in user's library
   */
  socket.on("check saved tracks", async (trackIds: string[]) => {
    await handlers.checkSavedTracks(connections, trackIds)
  })

  /**
   * Add tracks to user's library
   */
  socket.on("add to library", async (trackIds: string[]) => {
    await handlers.addToLibrary(connections, trackIds)
  })

  /**
   * Remove tracks from user's library
   */
  socket.on("remove from library", async (trackIds: string[]) => {
    await handlers.removeFromLibrary(connections, trackIds)
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createDJController instead
 */
export default createDJController
