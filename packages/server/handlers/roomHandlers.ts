import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
  isRoomAdmin,
  getAllMergedPluginConfigs,
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

  const isAdmin = await isRoomAdmin({ context, roomId: socket.data.roomId, userId: socket.data.userId, roomCreator: room.creator })

  // Admin-gated pull (ADR 0068 §2): this is a per-socket emit (io.to(socket.id)),
  // so returning MERGED plugin configs (public + server-only private fields) to an
  // admin here is safe and primes the settings editor with existing private values
  // (e.g. quiz questions/accepted answers). Non-admins never receive plugin configs
  // on this path — they hydrate public configs via INIT / ROOM_SETTINGS_UPDATED.
  const pluginConfigs = isAdmin
    ? await getAllMergedPluginConfigs({ context, roomId: socket.data.roomId })
    : undefined

  io.to(socket.id).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      ...(pluginConfigs ? { pluginConfigs } : {}),
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

  const isAdmin = await isRoomAdmin({ context, roomId: socket.data.roomId, userId: socket.data.userId, roomCreator: room.creator })

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
