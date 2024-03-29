import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
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
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      TYPING: {
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
          return event.data.typing
        },
      }),
    },
  },
)
