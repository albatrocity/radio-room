import { setup, assign } from "xstate"
import { User } from "../types/User"

interface Context {
  typing: User[]
}

type TypingEvent =
  | { type: "TYPING_CHANGED"; data: { typing: User[] } }
  | { type: "INIT"; data: { typing?: User[] } }

export const typingMachine = setup({
  types: {
    context: {} as Context,
    events: {} as TypingEvent,
  },
  actions: {
    setTyping: assign({
      typing: ({ event }) => {
        return event.data.typing || []
      },
    }),
  },
}).createMachine({
  id: "typing",
  initial: "connected",
  context: {
    typing: [],
  },
  on: {
    TYPING_CHANGED: {
      actions: ["setTyping"],
    },
    INIT: {
      actions: ["setTyping"],
    },
  },
  states: {
    disconnected: {},
    connected: {},
  },
})
