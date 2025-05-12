import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { sortByTimestamp } from "../lib/sortByTimestamp"
import { chatMachine } from "../machines/chatMachine"

export const useChatStore = create(xstate(chatMachine))
export const useSortedChatMessages = () => {
  return useChatStore((s) =>
    [...s.state.context.messages].sort(sortByTimestamp),
  )
}
