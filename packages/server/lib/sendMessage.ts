import { Server } from "socket.io"
import { ChatMessage, AppContext } from "@repo/types"
import { persistMessage } from "../operations/data"

async function sendMessage(io: Server, roomId: string = "/", message: ChatMessage, context?: AppContext) {
  // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
  if (context?.systemEvents && message) {
    await context.systemEvents.emit(roomId, "messageReceived", {
      roomId,
      message,
    })
  }

  // Persist message to database
  if (context && message) {
    await persistMessage({ roomId, message, context })
  }
}

export default sendMessage
