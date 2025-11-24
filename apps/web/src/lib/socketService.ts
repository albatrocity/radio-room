import { SocketCallback } from "../types/SocketCallback"
import socket from "./socket"

interface SocketEvent {
  type: any
  data: any
}

function socketService(callback: SocketCallback, receive: any) {
  // Handle incoming events from server
  socket.on("event", async function (e: SocketEvent) {
    if (socket.disconnected) {
      await socket.connect()
    }
    callback({ type: e.type, data: e.data })
  })

  // Handle socket.io lifecycle events
  socket.on("connect", () => {
    callback({ type: "SOCKET_CONNECTED", data: {} })
  })

  socket.on("disconnect", (reason) => {
    console.log("[SocketService] Disconnect reason:", reason)
    callback({ type: "SOCKET_DISCONNECTED", data: { reason } })
  })

  socket.on("reconnect_attempt", (attemptNumber) => {
    callback({ type: "SOCKET_RECONNECTING", data: { attemptNumber } })
  })

  socket.on("reconnect", (attemptNumber) => {
    console.log("[SocketService] Reconnected, need to rejoin room")
    callback({ type: "SOCKET_RECONNECTED", data: { attemptNumber } })
  })

  socket.on("reconnect_error", (error) => {
    callback({ type: "SOCKET_ERROR", data: { error: error.message } })
  })

  socket.on("reconnect_failed", () => {
    callback({ type: "SOCKET_RECONNECT_FAILED", data: {} })
  })

  socket.on("error", (error) => {
    console.error("[SocketService] Socket error:", error)
    callback({ type: "SOCKET_ERROR", data: { error } })
  })

  // Handle outgoing events to server
  receive((event: SocketEvent) => {
    // Only emit if socket is connected
    if (socket.connected) {
      socket.emit(event.type, event.data)
    } else {
      console.warn("[SocketService] Cannot emit event, socket disconnected:", event.type)
      // Try to reconnect if not already attempting
      if (!socket.active) {
        socket.connect()
      }
    }
  })
}

export default socketService
