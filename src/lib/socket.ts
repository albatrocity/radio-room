import socketIOClient from "socket.io-client"
const socketEndPoint: string = process.env.GATSBY_API_URL || ""
console.log("socketEndPoint", socketEndPoint)

const socket = socketIOClient(socketEndPoint, {
  transports: ["websocket", "polling"],
})

export default socket
