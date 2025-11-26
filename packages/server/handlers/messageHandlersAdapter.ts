import { HandlerConnections } from "@repo/types/HandlerConnections"
import { MessageService } from "../services/MessageService"
import sendMessage from "../lib/sendMessage"
import { AppContext } from "@repo/types"

/**
 * Socket.io adapter for the MessageService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class MessageHandlers {
  constructor(private messageService: MessageService) {}

  /**
   * Handle a new message event from Socket.io
   */
  newMessage = async ({ socket, io }: HandlerConnections, message: string) => {
    const { roomId, userId, username } = socket.data

    const result = await this.messageService.processNewMessage(roomId, userId, username, message)

    // Emit typing status update via SystemEvents
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "typingChanged", {
        roomId,
        typing: result.typing,
      })
    }

    // Send the message (broadcasts via SystemEvents)
    await sendMessage(io, roomId, result.message, socket.context)
  }

  /**
   * Handle a clear messages event from Socket.io
   */
  clearMessages = async ({ socket, io }: HandlerConnections) => {
    const { roomId } = socket.data
    await this.messageService.clearAllMessages(roomId)

    // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "messagesCleared", {
        roomId,
      })
    }
  }

  /**
   * Handle a start typing event from Socket.io
   */
  startTyping = async ({ socket }: HandlerConnections) => {
    const { roomId, userId } = socket.data
    const result = await this.messageService.addUserToTyping(roomId, userId)

    // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "typingChanged", {
        roomId,
        typing: result.typing,
      })
    }
  }

  /**
   * Handle a stop typing event from Socket.io
   */
  stopTyping = async ({ socket }: HandlerConnections) => {
    const { roomId, userId } = socket.data
    const result = await this.messageService.removeUserFromTyping(roomId, userId)

    // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "typingChanged", {
        roomId,
        typing: result.typing,
      })
    }
  }
}

/**
 * Factory function to create message handlers
 */
export function createMessageHandlers(context: AppContext) {
  const messageService = new MessageService(context)
  return new MessageHandlers(messageService)
}
