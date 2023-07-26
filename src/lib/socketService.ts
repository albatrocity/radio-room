import { SocketCallback } from "../types/SocketCallback"
import socket from "./socket"

interface SocketEvent {
  type: any
  data: any
}

function socketService(callback: SocketCallback, receive: any) {
  socket.on("event", async function (e: SocketEvent) {
    if (socket.disconnected) {
      await socket.connect()
    }
    callback({ type: e.type, data: e.data })
  })

  receive((event: SocketEvent) => {
    socket.emit(event.type, event.data)
  })
}

export default socketService
