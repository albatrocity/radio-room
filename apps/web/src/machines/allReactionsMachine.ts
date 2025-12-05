import { createMachine, assign } from "xstate"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

export type ReactionsContext = Record<
  ReactionSubject["type"],
  Record<string, Reaction[]>
>

export interface AllReactionsContext {
  reactions: ReactionsContext
}

export const allReactionsMachine = createMachine<AllReactionsContext>(
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
