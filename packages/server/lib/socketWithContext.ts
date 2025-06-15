import { Server, Socket } from "socket.io"
import { AppContext } from "./context"

// Extend the Socket type to include context
export interface SocketWithContext extends Socket {
  context: AppContext
}

// Helper function to add context to socket
export function addContextToSocket(socket: Socket, context: AppContext): SocketWithContext {
  return Object.assign(socket, { context })
}

// Helper function for controller handlers that need context
export type ControllerWithContext = (socket: SocketWithContext, io: Server) => void

// Helper function to create a controller that uses context
export function createContextController(
  controller: (socket: Socket, io: Server) => void,
  context: AppContext,
): ControllerWithContext {
  return (socket: SocketWithContext, io: Server) => {
    controller(socket, io)
  }
}
