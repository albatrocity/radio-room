import { Server } from "socket.io"
import { ChatMessage, AppContext } from "@repo/types"
import getRoomPath from "./getRoomPath"
import { persistMessage } from "../operations/data"

async function sendMessage(io: Server, roomId: string = "/", message: ChatMessage, context?: AppContext) {
  io.to(getRoomPath(roomId)).emit("event", {
    type: "NEW_MESSAGE",
    data: message,
  })
  if (context && message) {
    await persistMessage({ roomId, message, context })
  }
}

export default sendMessage
