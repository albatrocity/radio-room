import { ROOM_EXPIRE_TIME } from "../../lib/constants"
import {
  deleteRoom,
  expireRoomIn,
  findRoom,
  getRoomOnlineUserIds,
  removeRoomFromRoomList,
} from "../../operations/data"
import { getTtl } from "../../operations/data/utils"
import { AppContext } from "@repo/types"

export async function cleanupRoom(context: AppContext, roomId: string) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    await removeRoomFromRoomList({ context, roomId })
  }
  if (!room?.creator) {
    await deleteRoom({ context, roomId })
    return
  }

  const onlineIds = await getRoomOnlineUserIds({ context, roomId })

  // If the room creator is not online, the room is not persistent,
  // and the room has no ttl: set one
  if (!onlineIds.includes(room.creator) && !room.persistent) {
    const ttl = await getTtl({ context, key: `room:${roomId}:details` })
    if (ttl === -1) {
      await expireRoomIn({ context, roomId, ms: ROOM_EXPIRE_TIME * 1000 })
    }
  }
}
