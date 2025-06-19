import { RoomService } from "../services/RoomService"
import { HandlerConnections } from "@repo/types/HandlerConnections"
import { RoomSnapshot } from "@repo/types/Room"
import { AppContext } from "@repo/types"

/**
 * Socket.io adapter for the RoomService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class RoomHandlers {
  constructor(private roomService: RoomService) {}

  /**
   * Get room settings
   */
  getRoomSettings = async ({ io, socket }: HandlerConnections) => {
    const result = await this.roomService.getRoomSettings(socket.data.roomId, socket.data.userId)

    if (!result) {
      return
    }

    io.to(socket.id).emit("event", {
      type: "ROOM_SETTINGS",
      data: result,
    })
  }

  /**
   * Get latest room data since a snapshot
   */
  getLatestRoomData = async ({ io, socket }: HandlerConnections, snapshot: RoomSnapshot) => {
    const result = await this.roomService.getLatestRoomData(
      socket.data.roomId,
      socket.data.userId,
      snapshot,
    )

    if (!result) {
      return
    }

    io.to(socket.id).emit("event", {
      type: "ROOM_DATA",
      data: result,
    })
  }
}

/**
 * Factory function to create Room handlers
 */
export function createRoomHandlers(context: AppContext) {
  const roomService = new RoomService(context)
  return new RoomHandlers(roomService)
}
