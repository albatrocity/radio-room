import socketIOClient from "socket.io-client"
const socketEndPoint: string = import.meta.env.VITE_API_URL || ""

const socket = socketIOClient(socketEndPoint, {
  transports: ["websocket", "polling"],
  reconnectionDelayMax: 10000,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000,
  withCredentials: true,
  autoConnect: true,
})

// Add connection status logging for debugging
if (typeof window !== "undefined") {
  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id)
  })

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason)
  })

  socket.on("reconnect_attempt", (attemptNumber) => {
    console.log("[Socket] Reconnect attempt:", attemptNumber)
  })

  socket.on("reconnect", (attemptNumber) => {
    console.log("[Socket] Reconnected after", attemptNumber, "attempts")
  })

  socket.on("reconnect_error", (error) => {
    console.error("[Socket] Reconnect error:", error.message)
  })

  socket.on("reconnect_failed", () => {
    console.error("[Socket] Reconnection failed after all attempts")
  })
}

export default socket
