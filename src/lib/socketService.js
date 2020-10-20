import socket from "./socket"

function socketService(callback, receive) {
  console.log("socket service initiated!")
  socket.on("event", e => {
    console.log("event type", e.type)
    callback({ type: e.type, data: e.data })
  })

  receive(event => {
    console.log("action", event)
    socket.emit(event.type, event.data)
  })

  return () => {
    console.log("out")
  }
}

export default socketService
