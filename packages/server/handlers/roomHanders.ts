import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
} from "../operations/data";
import { HandlerConnections } from "../types/HandlerConnections";
import { RoomSnapshot } from "../types/Room";

export async function getRoomSettings({ io, socket }: HandlerConnections) {
  if (!socket.data.roomId) {
    return null;
  }
  const room = await findRoom(socket.data.roomId);
  if (!room) {
    return;
  }

  const isAdmin = socket.data.userId === room?.creator;

  io.to(socket.id).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
    },
  });
}

export async function getLatestRoomData(
  { io, socket }: HandlerConnections,
  snapshot: RoomSnapshot
) {
  if (!socket.data.roomId) {
    return null;
  }
  const room = await findRoom(socket.data.roomId);
  if (!room) {
    return;
  }

  const isAdmin = socket.data.userId === room?.creator;

  const messages = await getMessagesSince(room.id, snapshot.lastMessageTime);
  const playlist = await getRoomPlaylistSince(
    room.id,
    snapshot.lastPlaylistItemTime
  );

  io.to(socket.id).emit("event", {
    type: "ROOM_DATA",
    data: {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      messages,
      playlist,
    },
  });
}
