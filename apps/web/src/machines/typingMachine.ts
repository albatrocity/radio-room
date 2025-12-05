import { createMachine, assign } from "xstate"
import { User } from "../types/User"

interface Context {
  typing: User[]
}

export const typingMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
  },
  {
    actions: {
      setTyping: assign({
        typing: (_context, event) => {
          return event.data.typing || []
        },
      }),
    },
  },
)
