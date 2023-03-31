import socket from "./socket"

interface SocketEvent {
  type: string
  data: {}
}
type Callback = ({ type: string, data: {} }) => void

function socketService(callback: Callback, receive) {
  socket.on("event", async function (e: SocketEvent) {
    console.log("EVENT", e)
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
