import { Machine, assign, send } from "xstate"
import socketService from "../lib/socketService"
import { isNil, sortBy, uniqBy, reject, find, get } from "lodash/fp"

export const allReactionsMachine = Machine(
  {
    id: "allReactions",
    initial: "connected",
    context: {
      reactions: {
        message: {},
        track: {},
      },
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    on: {
      REACTIONS: {
        actions: ["setData"],
      },
      INIT: {
        actions: ["setData"],
      },
    },
    states: {
      connected: {},
    },
  },
  {
    actions: {
      setData: assign({
        reactions: (context, event) => event.data.reactions,
      }),
    },
  }
)
