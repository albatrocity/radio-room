/**
 * Bookmarked Chat Actor
 *
 * Singleton actor that manages bookmarked chat messages.
 * Always active, persists to session storage.
 */

import { createActor } from "xstate"
import { createToggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { ChatMessage } from "../types/ChatMessage"

// ============================================================================
// Actor Instance
// ============================================================================

const bookmarksMachine = createToggleableCollectionMachine({
  name: "bookmarks",
  idPath: "id",
  persistent: true,
  collection: [],
})

export const bookmarkedChatActor = createActor(bookmarksMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all bookmarked messages.
 */
export function getBookmarks(): ChatMessage[] {
  return bookmarkedChatActor.getSnapshot().context.collection
}

/**
 * Toggle a message bookmark.
 */
export function toggleBookmark(message: ChatMessage): void {
  bookmarkedChatActor.send({ type: "TOGGLE_ITEM", data: message })
}

/**
 * Check if a message is bookmarked.
 */
export function isBookmarked(messageId: string): boolean {
  const bookmarks = bookmarkedChatActor.getSnapshot().context.collection
  return bookmarks.some((msg: ChatMessage) => msg.id === messageId)
}

/**
 * Clear all bookmarks.
 */
export function clearBookmarks(): void {
  bookmarkedChatActor.send({ type: "CLEAR" })
}

/**
 * Set bookmarks (for rehydration).
 */
export function setBookmarks(messages: ChatMessage[]): void {
  bookmarkedChatActor.send({ type: "SET_ITEMS", data: messages })
}

