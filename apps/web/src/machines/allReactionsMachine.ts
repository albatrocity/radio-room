import { setup, assign } from "xstate"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

export type ReactionsContext = Record<
  ReactionSubject["type"],
  Record<string, Reaction[]>
>

export interface AllReactionsContext {
  reactions: ReactionsContext
}

type AllReactionsEvent =
  | { type: "REACTION_ADDED"; data: { reactions: ReactionsContext } }
  | { type: "REACTION_REMOVED"; data: { reactions: ReactionsContext } }
  | { type: "INIT"; data: { reactions: ReactionsContext } }

export const allReactionsMachine = setup({
  types: {
    context: {} as AllReactionsContext,
    events: {} as AllReactionsEvent,
  },
  actions: {
    setData: assign({
      reactions: ({ event }) => event.data.reactions,
    }),
  },
}).createMachine({
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
})
