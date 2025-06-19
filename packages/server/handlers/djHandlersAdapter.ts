import { DJService } from "../services/DJService"
import { QueueItem, HandlerConnections, AppContext, MetadataSource, User } from "@repo/types"
import sendMessage from "../lib/sendMessage"
import { pubUserJoined } from "../operations/sockets/users"

/**
 * Socket.io adapter for the DJService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class DJHandlers {
  constructor(private djService: DJService) {}

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
        sendMessage(io, roomId, result.systemMessage)
      }
    } catch (e) {
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
   * Search for tracks using a metadata source
   */
  searchForTrack = async (
    { socket }: HandlerConnections,
    metadataSource: MetadataSource,
    { query }: { query: string },
  ) => {
    const result = await this.djService.searchForTrack(metadataSource, query)

    if (result.success) {
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: result.data,
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
   * Save a playlist to a metadata source
   */
  savePlaylist = async (
    { socket }: HandlerConnections,
    metadataSource: MetadataSource,
    { name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"][] },
  ) => {
    const result = await this.djService.savePlaylist(
      metadataSource,
      socket.data.userId,
      name,
      trackIds,
    )

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
}

/**
 * Factory function to create DJ handlers
 */
export function createDJHandlers(context: AppContext) {
  const djService = new DJService(context)
  return new DJHandlers(djService)
}
