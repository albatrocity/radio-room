import { Server } from "socket.io"
import { SocketWithContext } from "../lib/socketWithContext"
import { createMessageHandlers } from "../handlers/messageHandlersAdapter"

/**
 * Message Controller - Manages chat message events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createMessageController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createMessageHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Handle new chat message
   */
  socket.on("SEND_MESSAGE", async (message: string) => {
    await handlers.newMessage(connections, message)
  })

  /**
   * Clear all messages in the room
   */
  socket.on("CLEAR_MESSAGES", async () => {
    await handlers.clearMessages(connections)
  })

  /**
   * Indicate user is typing
   */
  socket.on("START_TYPING", async () => {
    await handlers.startTyping(connections)
  })

  /**
   * Indicate user stopped typing
   */
  socket.on("STOP_TYPING", async () => {
    await handlers.stopTyping(connections)
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createMessageController instead
 */
export default createMessageController
