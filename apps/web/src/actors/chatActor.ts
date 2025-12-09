/**
 * Chat Actor
 *
 * Singleton actor that manages chat messages state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { chatMachine } from "../machines/chatMachine"
import { ChatMessage } from "../types/ChatMessage"

/**
 * Image data to be sent with a message
 */
type ImageData = {
  data: string // base64 encoded
  mimeType: string
}

/**
 * Message payload that can include images
 */
type MessagePayload = {
  content: string
  images?: ImageData[]
}

// ============================================================================
// Actor Instance
// ============================================================================

export const chatActor = createActor(chatMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all chat messages.
 */
export function getChatMessages(): ChatMessage[] {
  return chatActor.getSnapshot().context.messages
}

/**
 * Get sorted chat messages (by timestamp).
 */
export function getSortedChatMessages(): ChatMessage[] {
  const messages = chatActor.getSnapshot().context.messages
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime()
    const bTime = new Date(b.timestamp).getTime()
    return aTime - bTime
  })
}

/**
 * Submit a new chat message.
 */
export function submitMessage(payload: MessagePayload): void {
  chatActor.send({ type: "SUBMIT_MESSAGE", data: payload })
}

/**
 * Start typing indicator.
 */
export function startTyping(): void {
  chatActor.send({ type: "START_TYPING" })
}

/**
 * Stop typing indicator.
 */
export function stopTyping(): void {
  chatActor.send({ type: "STOP_TYPING" })
}
