import { Server } from "socket.io"
import { SocketWithContext } from "../server/lib/socketWithContext"

export type HandlerConnections = { socket: SocketWithContext; io: Server }
