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
  private adapterService: AdapterService

  constructor(
    private djService: DJService,
    private context: AppContext,
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
   * Search for tracks using the room's metadata source
   */
  searchForTrack = async ({ socket }: HandlerConnections, { query }: { query: string }) => {
    const { roomId } = socket.data

    // Get the room's metadata source
    const metadataSource = await this.adapterService.getRoomMetadataSource(roomId)

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
}

/**
 * Factory function to create DJ handlers
 */
export function createDJHandlers(context: AppContext) {
  const djService = new DJService(context)
  return new DJHandlers(djService, context)
}
