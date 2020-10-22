import socket from "./socket"

function socketService(callback, receive) {
  socket.on("event", e => {
    callback({ type: e.type, data: e.data })
  })

  receive(event => {
    socket.emit(event.type, event.data)
  })
}

export default socketService
