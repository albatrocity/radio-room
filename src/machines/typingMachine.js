import { Machine, assign, send } from "xstate"
import socketService from "../lib/socketService"
import { sortBy, uniqBy, reject, find, get } from "lodash/fp"

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
