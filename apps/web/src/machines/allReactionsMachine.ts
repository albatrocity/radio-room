import { createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

export type ReactionsContext = Record<
  ReactionSubject["type"],
  Record<string, Reaction[]>
>

interface Context {
  reactions: ReactionsContext
}

export const allReactionsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
      REACTION_ADDED: {
        actions: ["setData"],
      },
      REACTION_REMOVED: {
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
