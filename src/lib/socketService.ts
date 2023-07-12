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

  receive((event: SocketEvent) => {
    socket.emit(event.type, event.data)
  })
}

export default socketService
