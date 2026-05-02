import { HandlerConnections } from "@repo/types/HandlerConnections"
import { MessageService } from "../services/MessageService"
import sendMessage from "../lib/sendMessage"
import { AppContext } from "@repo/types"

/**
 * Message payload - supports both simple string and object format
 * Images are uploaded via HTTP and their markdown is included in the content
 */
export type MessagePayload =
  | string
  | {
      content: string
    }

/**
 * Socket.io adapter for the MessageService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class MessageHandlers {
  constructor(
    private messageService: MessageService,
    private context: AppContext,
  ) {}

  /**
   * Handle a new message event from Socket.io
   * Supports both legacy string messages and object format with content
   */
  newMessage = async ({ socket, io }: HandlerConnections, message: MessagePayload) => {
    const { roomId, userId, username } = socket.data

    if (!roomId) {
      console.warn("[MessageHandler] SEND_MESSAGE dropped: no roomId on socket (client should re-LOGIN after reconnect)", {
        socketId: socket.id,
      })
      return
    }

    // Normalize the message payload
    const content = typeof message === "string" ? message : message.content

    const result = await this.messageService.processNewMessage(roomId, userId, username, content)

    // Emit typing status update via SystemEvents
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "TYPING_CHANGED", {
        roomId,
        typing: result.typing,
      })
    }

    const registry = socket.context.pluginRegistry
    const messageToSend = registry
      ? await registry.transformChatMessage(roomId, result.message)
      : result.message

    // Send the message (broadcasts via SystemEvents)
    await sendMessage(io, roomId, messageToSend, socket.context)
  }

  /**
   * Handle a clear messages event from Socket.io
   */
  clearMessages = async ({ socket, io }: HandlerConnections) => {
    const { roomId } = socket.data
    await this.messageService.clearAllMessages(roomId)

    // Emit via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "MESSAGES_CLEARED", {
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
      await socket.context.systemEvents.emit(roomId, "TYPING_CHANGED", {
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
      await socket.context.systemEvents.emit(roomId, "TYPING_CHANGED", {
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
  return new MessageHandlers(messageService, context)
}
