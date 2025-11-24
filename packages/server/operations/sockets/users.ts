import { PUBSUB_USER_JOINED } from "../../lib/constants"
import { getRoomPath } from "../../lib/getRoomPath"
import { Room, User, AppContext } from "@repo/types"
import { Server } from "socket.io"

type UsersData = {
  users: User[]
  user?: User
}

export async function pubUserJoined({
  io,
  roomId,
  data,
  context,
}: {
  io: Server
  roomId: Room["id"]
  data: UsersData
  context: AppContext
}) {
  io.to(getRoomPath(roomId)).emit("event", {
    type: "USER_JOINED",
    data: data,
  })
  context.redis.pubClient.publish(PUBSUB_USER_JOINED, JSON.stringify({ roomId, data: data }))
}
