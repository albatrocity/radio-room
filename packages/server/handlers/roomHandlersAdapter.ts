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

    // Admin-gated pull (ADR 0068 §2): this is a per-socket emit (io.to(socket.id)),
    // so returning MERGED plugin configs (public + server-only private fields) to an
    // admin is safe here and primes the settings editor with existing private values
    // (e.g. quiz questions/accepted answers). Non-admins only ever receive PUBLIC
    // configs. Because the client treats ROOM_SETTINGS as the authoritative merged
    // pull (it replaces stored configs), a public-only payload here would wipe an
    // admin's previously-fetched private fields on modal reopen.
    const { getAllPluginConfigs, getAllMergedPluginConfigs } = await import(
      "../operations/data/pluginConfigs"
    )
    const pluginConfigs = result.isAdmin
      ? await getAllMergedPluginConfigs({ context: socket.context, roomId: socket.data.roomId })
      : await getAllPluginConfigs({ context: socket.context, roomId: socket.data.roomId })

    io.to(socket.id).emit("event", {
      type: "ROOM_SETTINGS",
      data: {
        room: result.room,
        pluginConfigs,
      },
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
