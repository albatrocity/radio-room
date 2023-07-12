import socket from "./socket"

interface SocketEvent {
  type: string
  data: any
}
type Callback = ({ type, data }: { type: "string"; data: any }) => void

function socketService(callback: Callback, receive) {
  socket.on("event", async function (e: SocketEvent) {
    if (socket.disconnected) {
      await socket.connect()
    }
    callback({ type: e.type, data: e.data })
  })

  receive((event) => {
    socket.emit(event.type, event.data)
  })
}

export default socketService
