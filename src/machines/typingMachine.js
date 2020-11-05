import { Machine, assign } from "xstate"
import socketService from "../lib/socketService"

export const typingMachine = Machine(
  {
    id: "typing",
    initial: "connected",
    context: {
      typing: [],
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
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
        typing: (context, event) => {
          return event.data.typing
        },
      }),
    },
  }
)
