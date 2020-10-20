import nanobus from "nanobus"

const bus = nanobus()
const callbacks = []

bus.on("*", (type, data) => {
  callbacks.forEach(callback => callback({ type, data }))
})

function eventBus(callback, receive) {
  callbacks.push(callback)
  console.log("bus service initiated!")

  receive(event => {
    console.log("bus action", event)
    bus.emit(event.type, event.data)
  })

  return () => {
    callbacks.splice(callbacks.indexOf(callback), 1)
    console.log("bus out")
  }
}

export default eventBus
