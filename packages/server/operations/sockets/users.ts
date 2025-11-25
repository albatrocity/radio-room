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
  // Emit to Socket.IO clients
  io.to(getRoomPath(roomId)).emit("event", {
    type: "USER_JOINED",
    data: data,
  })

  // Emit userJoined event via SystemEvents
  if (data.user && context.systemEvents) {
    await context.systemEvents.emit(roomId, "userJoined", {
      roomId,
      user: data.user,
    })
  }
}
