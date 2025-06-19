import { Server } from "socket.io"
import { ChatMessage } from "@repo/types"
import getRoomPath from "./getRoomPath"
import { persistMessage } from "../operations/data"

async function sendMessage(io: Server, roomId: string = "/", message: ChatMessage) {
  io.to(getRoomPath(roomId)).emit("event", {
    type: "NEW_MESSAGE",
    data: message,
  })
  await persistMessage(roomId, message)
}

export default sendMessage
