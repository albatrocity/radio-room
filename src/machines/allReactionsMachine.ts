import { Machine, assign } from "xstate"
import socketService from "../lib/socketService"

type ReactionEvent = {
  data: {
    reactions: {}
    message: {}
    track: {}
  }
}

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
        src: (_ctx, _event) => socketService,
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
        reactions: (_context: {}, event: ReactionEvent) => event.data.reactions,
      }),
    },
  },
)
