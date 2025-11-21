import { DJService } from "../services/DJService"
import { QueueItem, HandlerConnections, AppContext, User } from "@repo/types"
import sendMessage from "../lib/sendMessage"
import { pubUserJoined } from "../operations/sockets/users"
import { AdapterService } from "../services/AdapterService"

/**
 * Socket.io adapter for the DJService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class DJHandlers {
  private readonly adapterService: AdapterService

  constructor(
    private readonly djService: DJService,
    private readonly context: AppContext,
  ) {
    this.adapterService = new AdapterService(context)
  }

  /**
   * Deputize or undeputize a user as a DJ
   */
  djDeputizeUser = async ({ io, socket }: HandlerConnections, userId: User["userId"]) => {
    const { context } = socket

    const result = await this.djService.deputizeUser(socket.data.roomId, userId)

    if (result.socketId) {
      io.to(result.socketId).emit(
        "event",
        {
          type: "NEW_MESSAGE",
          data: result.systemMessage,
        },
        { status: "info" },
      )

      io.to(result.socketId).emit("event", { type: result.eventType })
    }

    if (result.user) {
      pubUserJoined({
        io,
        roomId: socket.data.roomId,
        data: { user: result.user, users: result.users },
        context,
      })
    }
  }

  /**
   * Add a song to the queue
   */
  queueSong = async ({ socket, io }: HandlerConnections, id: QueueItem["track"]["id"]) => {
    try {
      const { userId, username, roomId } = socket.data

      const result = await this.djService.queueSong(roomId, userId, username, id)

      if (!result.success) {
        socket.emit("event", {
          type: "SONG_QUEUE_FAILURE",
          data: {
            message: result.message,
          },
        })
        return
      }

      socket.emit("event", {
        type: "SONG_QUEUED",
        data: result.queuedItem,
      })

      if (result.systemMessage) {
        sendMessage(io, roomId, result.systemMessage, this.context)
      }
    } catch (e) {
      console.error("Error queueing song:", e)
      socket.emit("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message: "Song could not be queued",
          error: e,
        },
      })
    }
  }

  /**
   * Check if tracks are saved in user's library
   */
  checkSavedTracks = async ({ socket }: HandlerConnections, trackIds: string[]) => {
    try {
      const { roomId, userId } = socket.data

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        // Return empty results for invalid input
        socket.emit("event", {
          type: "CHECK_SAVED_TRACKS_RESULTS",
          data: { results: [], trackIds: [] },
        })
        return
      }

      const metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.checkSavedTracks) {
        // Service doesn't support library - return all false gracefully
        const results = trackIds.map(() => false)
        socket.emit("event", {
          type: "CHECK_SAVED_TRACKS_RESULTS",
          data: { results, trackIds },
        })
        return
      }

      const results = await metadataSource.api.checkSavedTracks(trackIds)

      socket.emit("event", {
        type: "CHECK_SAVED_TRACKS_RESULTS",
        data: { results, trackIds },
      })
    } catch (error: any) {
      console.error("Error checking saved tracks:", error)
      socket.emit("event", {
        type: "CHECK_SAVED_TRACKS_FAILURE",
        data: { message: error?.message || "Failed to check saved tracks" },
      })
    }
  }

  /**
   * Add tracks to user's library
   */
  addToLibrary = async ({ socket }: HandlerConnections, trackIds: string[]) => {
    try {
      const { roomId, userId } = socket.data

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        // Silently ignore - no tracks to add
        return
      }

      const metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.addToLibrary) {
        // Service doesn't support library - silently ignore
        return
      }

      await metadataSource.api.addToLibrary(trackIds)

      socket.emit("event", {
        type: "ADD_TO_LIBRARY_SUCCESS",
        data: { trackIds },
      })
    } catch (error: any) {
      console.error("Error adding to library:", error)
      socket.emit("event", {
        type: "ADD_TO_LIBRARY_FAILURE",
        data: { message: error?.message || "Failed to add to library" },
      })
    }
  }

  /**
   * Remove tracks from user's library
   */
  removeFromLibrary = async ({ socket }: HandlerConnections, trackIds: string[]) => {
    try {
      const { roomId, userId } = socket.data

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        // Silently ignore - no tracks to remove
        return
      }

      const metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.removeFromLibrary) {
        // Service doesn't support library - silently ignore
        return
      }

      await metadataSource.api.removeFromLibrary(trackIds)

      socket.emit("event", {
        type: "REMOVE_FROM_LIBRARY_SUCCESS",
        data: { trackIds },
      })
    } catch (error: any) {
      console.error("Error removing from library:", error)
      socket.emit("event", {
        type: "REMOVE_FROM_LIBRARY_FAILURE",
        data: { message: error?.message || "Failed to remove from library" },
      })
    }
  }

  /**
   * Search for tracks using the room creator's metadata source
   * This allows guests without Spotify auth to search using the room's credentials
   */
  searchForTrack = async ({ socket }: HandlerConnections, { query }: { query: string }) => {
    const { roomId } = socket.data

    // Get the room to find the creator
    const { findRoom } = await import("../operations/data")
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          message: "Room not found",
        },
      })
      return
    }

    // Use the room creator's metadata source so guests can search
    const metadataSource = await this.adapterService.getUserMetadataSource(roomId, room.creator)

    if (!metadataSource) {
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          message: "No metadata source configured for this room",
        },
      })
      return
    }

    const result = await this.djService.searchForTrack(metadataSource, query)

    if (result.success) {
      // Wrap the results in the format the frontend expects
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: {
          items: result.data || [], // Frontend expects { items: [...] }
          total: result.data?.length || 0,
          offset: 0,
          limit: 20,
        },
      })
    } else {
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          message: result.message,
          error: result.error,
        },
      })
    }
  }

  /**
   * Save a playlist to the room's metadata source
   */
  savePlaylist = async (
    { socket }: HandlerConnections,
    { name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"][] },
  ) => {
    const { roomId, userId } = socket.data

    // Get the room's metadata source
    const metadataSource = await this.adapterService.getRoomMetadataSource(roomId)

    if (!metadataSource) {
      socket.emit("event", {
        type: "SAVE_PLAYLIST_FAILED",
        error: new Error("No metadata source configured for this room"),
      })
      return
    }

    const result = await this.djService.savePlaylist(metadataSource, userId, name, trackIds)

    if (result.success) {
      socket.emit("event", { type: "PLAYLIST_SAVED", data: result.data })
    } else {
      socket.emit("event", { type: "SAVE_PLAYLIST_FAILED", error: result.error })
    }
  }

  /**
   * Handle a user joining, automatically deputizing them if needed
   */
  handleUserJoined = async (
    { io, socket }: HandlerConnections,
    { user }: { user: User; users: User[] },
  ) => {
    const result = await this.djService.handleUserJoined(socket.data.roomId, user)

    if (result.shouldDeputize && result.userId) {
      this.djDeputizeUser({ io, socket }, result.userId)
    }
  }

  /**
   * Get saved tracks for the current user
   */
  getSavedTracks = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data

      const metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.getSavedTracks) {
        // Silently return empty array if not supported
        socket.emit("event", {
          type: "SAVED_TRACKS_RESULTS",
          data: [],
        })
        return
      }

      const savedTracks = await metadataSource.api.getSavedTracks()

      socket.emit("event", {
        type: "SAVED_TRACKS_RESULTS",
        data: savedTracks,
      })
    } catch (error: any) {
      console.error("Error fetching saved tracks:", error)
      socket.emit("event", {
        type: "SAVED_TRACKS_RESULTS_FAILURE",
        error: error?.message || "Failed to fetch saved tracks",
      })
    }
  }
}

/**
 * Factory function to create DJ handlers
 */
export function createDJHandlers(context: AppContext) {
  const djService = new DJService(context)
  return new DJHandlers(djService, context)
}
