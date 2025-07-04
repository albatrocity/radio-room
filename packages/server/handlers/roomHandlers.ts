import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
} from "../operations/data"
import { HandlerConnections } from "@repo/types/HandlerConnections"
import { RoomSnapshot } from "@repo/types/Room"

export async function getRoomSettings({ io, socket }: HandlerConnections) {
  const { context } = socket
  if (!socket.data.roomId) {
    return null
  }
  const room = await findRoom({ context, roomId: socket.data.roomId })

  if (!room) {
    return
  }

  const isAdmin = socket.data.userId === room?.creator

  io.to(socket.id).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
    },
  })
}

export async function getLatestRoomData(
  { io, socket }: HandlerConnections,
  snapshot: RoomSnapshot,
) {
  const { context } = socket
  if (!socket.data.roomId) {
    return null
  }
  const room = await findRoom({ context, roomId: socket.data.roomId })
  if (!room) {
    return
  }

  const isAdmin = socket.data.userId === room?.creator

  const messages = await getMessagesSince({
    context,
    roomId: room.id,
    since: snapshot.lastMessageTime,
  })
  const playlist = await getRoomPlaylistSince({
    context,
    roomId: room.id,
    since: snapshot.lastPlaylistItemTime,
  })

  io.to(socket.id).emit("event", {
    type: "ROOM_DATA",
    data: {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      messages,
      playlist,
    },
  })
}
