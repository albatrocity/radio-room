import { HandlerConnections } from "@repo/types/HandlerConnections"
import { MessageService } from "../services/MessageService"
import sendMessage from "../lib/sendMessage"
import { AppContext } from "@repo/types"
import { storeImage } from "../operations/data"
import generateId from "../lib/generateId"

/**
 * Image data structure for uploaded images
 */
export type ImageData = {
  data: string // base64 encoded image data
  mimeType: string
}

/**
 * Message payload that supports both simple string messages and messages with images
 */
export type MessagePayload =
  | string
  | {
      content: string
      images?: ImageData[]
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
   * Supports both legacy string messages and new object format with images
   */
  newMessage = async ({ socket, io }: HandlerConnections, message: MessagePayload) => {
    const { roomId, userId, username } = socket.data

    // Normalize the message payload
    let content: string
    let images: ImageData[] | undefined

    if (typeof message === "string") {
      content = message
    } else {
      content = message.content
      images = message.images
    }

    // Process images if present - store them and append as markdown images
    if (images && images.length > 0) {
      const markdownImages: string[] = []
      const apiUrl = this.context.apiUrl || ""

      for (const image of images) {
        const imageId = generateId()

        // Store the image in Redis
        await storeImage({
          roomId,
          imageId,
          base64Data: image.data,
          mimeType: image.mimeType,
          context: this.context,
        })

        // Build markdown image syntax with full URL
        // Format: ![image](url)
        const imageUrl = `${apiUrl}/api/rooms/${roomId}/images/${imageId}`
        markdownImages.push(`![image](${imageUrl})`)
      }

      // Append markdown images to the message content
      if (markdownImages.length > 0) {
        const imagesText = markdownImages.join("\n")
        content = content ? `${content}\n\n${imagesText}` : imagesText
      }
    }

    const result = await this.messageService.processNewMessage(roomId, userId, username, content)

    // Emit typing status update via SystemEvents
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(roomId, "TYPING_CHANGED", {
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
