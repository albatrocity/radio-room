import { AdminService } from "../services/AdminService"
import { HandlerConnections, AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { getRoomPath } from "../lib/getRoomPath"

/**
 * Socket.io adapter for the AdminService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class AdminHandlers {
  constructor(private adminService: AdminService) {}

  /**
   * Get room settings for an admin
   */
  getRoomSettings = async ({ io, socket }: HandlerConnections) => {
    const result = await this.adminService.getRoomSettings(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    io.to(socket.id).emit("event", {
      type: "ROOM_SETTINGS",
      data: {
        room: result.room,
      },
    })
  }

  /**
   * Set a room password
   */
  setPassword = async ({ socket }: HandlerConnections, value: string) => {
    await this.adminService.setPassword(socket.data.roomId, value)
  }

  /**
   * Kick a user from a room
   */
  kickUser = async ({ io, socket }: HandlerConnections, user: User) => {
    const result = await this.adminService.kickUser(user)

    if (result.socketId) {
      io.to(result.socketId).emit("event", { type: "NEW_MESSAGE", data: result.message })
      io.to(result.socketId).emit("event", { type: "KICKED" })

      if (io.sockets.sockets.get(result.socketId)) {
        io.sockets.sockets.get(result.socketId)?.disconnect()
      }
    }
  }

  /**
   * Update room settings
   */
  setRoomSettings = async ({ socket, io }: HandlerConnections, values: Partial<Room>) => {
    const result = await this.adminService.setRoomSettings(
      socket.data.roomId,
      socket.data.userId,
      values,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "ROOM_SETTINGS",
      data: { room: result.room },
    })
  }

  /**
   * Clear a room's playlist
   */
  clearPlaylist = async ({ socket, io }: HandlerConnections) => {
    const result = await this.adminService.clearPlaylist(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.success) {
      return
    }

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "PLAYLIST",
      data: [],
    })
  }
}

/**
 * Factory function to create Admin handlers
 */
export function createAdminHandlers(context: AppContext) {
  const adminService = new AdminService(context)
  return new AdminHandlers(adminService)
}
