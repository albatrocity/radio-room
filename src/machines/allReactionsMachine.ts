import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

interface Context {
  reactions: Record<ReactionSubject["type"], Record<string, Reaction[]>>
}

export const allReactionsMachine = createMachine<Context>(
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
        reactions: (_context: {}, event) => event.data.reactions,
      }),
    },
  },
)
