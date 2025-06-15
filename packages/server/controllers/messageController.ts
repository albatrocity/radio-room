import { Server } from "socket.io"

import { clearMessages, newMessage, startTyping, stopTyping } from "../handlers/messageHandlers"
import { SocketWithContext } from "../lib/socketWithContext"

export default function messageController(socket: SocketWithContext, io: Server) {
  socket.on("new message", (message: string) => newMessage({ socket, io }, message))
  socket.on("clear messages", () => clearMessages({ socket, io }))
  socket.on("typing", () => startTyping({ socket, io }))
  socket.on("stop typing", () => stopTyping({ socket, io }))
}
