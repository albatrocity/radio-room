import { ROOM_EXPIRE_TIME } from "../../lib/constants";
import {
  deleteRoom,
  expireRoomIn,
  findRoom,
  getRoomOnlineUserIds,
  removeRoomFromRoomList,
} from "../../operations/data";
import { getTtl } from "../../operations/data/utils";

export async function cleanupRoom(roomId: string) {
  const room = await findRoom(roomId);
  if (!room) {
    await removeRoomFromRoomList(roomId);
  }
  if (!room?.creator) {
    await deleteRoom(roomId);
    return;
  }

  const onlineIds = await getRoomOnlineUserIds(roomId);

  // If the room creator is not online, the room is not persistent,
  // and the room has no ttl: set one
  if (!onlineIds.includes(room.creator) && !room.persistent) {
    const ttl = await getTtl(`room:${roomId}:details`);
    if (ttl === -1) {
      await expireRoomIn(roomId, ROOM_EXPIRE_TIME);
    }
  }
}
