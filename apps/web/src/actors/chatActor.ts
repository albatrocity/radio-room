/**
 * Chat Actor
 *
 * Singleton actor that manages chat messages state.
 * Active in room, subscribes to socket events for message updates.
 */

import { createActor } from "xstate"
import { chatMachine } from "../machines/chatMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { ChatMessage } from "../types/ChatMessage"

// ============================================================================
// Actor Instance
// ============================================================================

export const chatActor = createActor(chatMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribeChatActor(): void {
  if (!isSubscribed) {
    subscribeActor(chatActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeChatActor(): void {
  if (isSubscribed) {
    unsubscribeActor(chatActor)
    isSubscribed = false
  }
}

/**
 * Reset chat state. Called when leaving a room.
 * Uses RESET (local only) instead of CLEAR_MESSAGES (emits to server).
 */
export function resetChat(): void {
  chatActor.send({ type: "RESET" })
}

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
export function submitMessage(content: ChatMessage["content"]): void {
  chatActor.send({ type: "SUBMIT_MESSAGE", data: content })
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

