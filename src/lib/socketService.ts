import socket from "./socket"

interface SocketEvent {
  type: any
  data: any
}
type Callback = ({ type, data }: { type: string; data: any }) => void

function socketService(callback: Callback, receive: any) {
  socket.on("event", async function (e: SocketEvent) {
    if (socket.disconnected) {
      await socket.connect()
    }
    callback({ type: e.type, data: e.data })
  })

  socket.io.on("error", (error) => {
    callback({ type: "SOCKET_ERROR", data: error })
    callback({
      type: "ERROR",
      data: {
        message:
          "There was an error connecting to the server. Please try again later.",
        error: error.message,
        status: 500,
      },
    })
  })
  socket.io.on("reconnect", () => {
    callback({ type: "SOCKET_RECONNECTED", data: {} })
  })

  receive((event: SocketEvent) => {
    socket.emit(event.type, event.data)
  })
}

export default socketService
