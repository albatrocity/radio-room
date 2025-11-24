import { Server, Socket } from "socket.io"
import { AppContext } from "@repo/types"

// Extend the Socket type to include context
export interface SocketWithContext extends Socket {
  context: AppContext
}

// Helper function to add context to socket
export function addContextToSocket(socket: Socket, context: AppContext): SocketWithContext {
  // Create a proxy that preserves all the original socket properties and methods
  // but also adds the context property
  const socketWithContext = new Proxy(socket, {
    get(target, prop, receiver) {
      if (prop === "context") {
        return context
      }
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (prop === "context") {
        // Context is read-only after initialization
        return true
      }
      return Reflect.set(target, prop, value, receiver)
    },
  }) as SocketWithContext

  return socketWithContext
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
