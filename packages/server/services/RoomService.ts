import { AppContext } from "@repo/types"
import { RoomSnapshot } from "@repo/types/Room"
import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
} from "../operations/data"

/**
 * A service that handles Room-related operations without Socket.io dependencies
 */
export class RoomService {
  constructor(private context: AppContext) {}

  /**
   * Get room settings
   */
  async getRoomSettings(roomId: string, userId: string) {
    if (!roomId) {
      return null
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return null
    }

    const isAdmin = userId === room?.creator

    return {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
    }
  }

  /**
   * Get latest room data since a snapshot
   */
  async getLatestRoomData(roomId: string, userId: string, snapshot: RoomSnapshot) {
    if (!roomId) {
      return null
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return null
    }

    const isAdmin = userId === room?.creator

    const messages = await getMessagesSince({
      context: this.context,
      roomId: room.id,
      since: snapshot.lastMessageTime,
    })

    const playlist = await getRoomPlaylistSince({
      context: this.context,
      roomId: room.id,
      since: snapshot.lastPlaylistItemTime,
    })

    return {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      messages,
      playlist,
    }
  }
}
