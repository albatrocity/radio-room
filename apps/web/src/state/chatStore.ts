import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { sortByTimestamp } from "../lib/sortByTimestamp"
import { chatMachine } from "../machines/chatMachine"
import { ChatMessage } from "../types/ChatMessage"

export const useChatStore = create(xstate(chatMachine))

// Cache for sorted messages to prevent re-sorting on every subscriber read
let cachedMessages: ChatMessage[] = []
let cachedSorted: ChatMessage[] = []

export const useSortedChatMessages = () => {
  return useChatStore((s) => {
    const messages = s.state.context.messages
    // Only re-sort if the messages array reference has changed
    if (messages !== cachedMessages) {
      cachedMessages = messages
      cachedSorted = [...messages].sort(sortByTimestamp)
    }
    return cachedSorted
  })
}
