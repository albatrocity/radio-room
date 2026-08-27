import type { Server } from "socket.io"
import type { AppContext } from "@repo/types"
import { getOnlineUserSocketId } from "../operations/data"

/**
 * Deliver a socket event to one user's current connection (ADR 0048 / 0120).
 * Resolves the socket via `getOnlineUserSocketId` (online set + user hash).
 * Warns and no-ops when the user is offline.
 */
export async function emitToUserSocket(params: {
  io: Server
  context: AppContext
  roomId: string
  userId: string
  type: string
  data: unknown
}): Promise<void> {
  const socketId = await getOnlineUserSocketId({
    context: params.context,
    roomId: params.roomId,
    userId: params.userId,
  })
  if (!socketId) {
    console.warn(
      `[emitToUserSocket] no connected socket for userId ${params.userId} in room ${params.roomId}`,
    )
    return
  }
  params.io.to(socketId).emit("event", { type: params.type, data: params.data })
}
