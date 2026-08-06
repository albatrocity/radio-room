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
  // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
  if (data.user && context.systemEvents) {
    await context.systemEvents.emit(roomId, "USER_JOINED", {
      roomId,
      user: data.user,
      users: data.users,
    })
  }
}

/**
 * Emit a single-user status change (listening / participating / transport).
 * Prefer this over USER_JOINED when the online set is unchanged.
 */
export async function pubUserStatusChanged({
  roomId,
  user,
  oldStatus,
  context,
}: {
  roomId: Room["id"]
  user: User
  oldStatus?: string
  context: AppContext
}) {
  if (!context.systemEvents) return
  await context.systemEvents.emit(roomId, "USER_STATUS_CHANGED", {
    roomId,
    user,
    oldStatus,
  })
}
