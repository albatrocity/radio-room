import parseMessage from "../lib/parseMessage"
import sendMessage from "../lib/sendMessage"
import { clearMessages as clearMessagesData, getUser } from "../operations/data"

import { HandlerConnections } from "@repo/types/HandlerConnections"
import { User } from "@repo/types/User"
import getRoomPath from "../lib/getRoomPath"
import { addTypingUser, getTypingUsers, removeTypingUser } from "../operations/data"

export async function newMessage({ socket, io }: HandlerConnections, message: string) {
  const { context } = socket
  const user = await getUser({ context, userId: socket.data.userId })
  const { content, mentions } = parseMessage(socket.data.roomId, message)
  const fallbackUser: User = {
    username: socket.data.username,
    userId: socket.data.userId,
  }
  const payload = {
    user: user ?? fallbackUser,
    content,
    mentions,
    timestamp: new Date().toISOString(),
  }

  await removeTypingUser({ context, roomId: socket.data.roomId, userId: socket.data.userId })
  const typing = await getTypingUsers({ context, roomId: socket.data.roomId })

  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "TYPING",
    data: { typing },
  })
  await sendMessage(io, socket.data.roomId, payload)
}

export async function clearMessages({ socket, io }: HandlerConnections) {
  const { context } = socket
  const roomId = socket?.data?.roomId
  await clearMessagesData({ context, roomId })
  io.to(getRoomPath(roomId)).emit("event", {
    type: "SET_MESSAGES",
    data: { messages: [] },
  })
}

export async function startTyping({ socket }: HandlerConnections) {
  const { context } = socket
  if (socket.data.userId) {
    await addTypingUser({ context, roomId: socket.data.roomId, userId: socket.data.userId })
  }
  const typing = await getTypingUsers({ context, roomId: socket.data.roomId })
  socket.broadcast.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "TYPING",
    data: { typing },
  })
}

export async function stopTyping({ socket }: HandlerConnections) {
  const { context } = socket
  await removeTypingUser({ context, roomId: socket.data.roomId, userId: socket.data.userId })
  const typing = await getTypingUsers({ context, roomId: socket.data.roomId })
  socket.broadcast.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "TYPING",
    data: { typing },
  })
}
