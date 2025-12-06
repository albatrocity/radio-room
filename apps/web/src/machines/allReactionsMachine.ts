import { setup, assign } from "xstate"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export type ReactionsContext = Record<
  ReactionSubject["type"],
  Record<string, Reaction[]>
>

export interface AllReactionsContext {
  reactions: ReactionsContext
  subscriptionId: string | null
}

type AllReactionsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REACTION_ADDED"; data: { reactions: ReactionsContext } }
  | { type: "REACTION_REMOVED"; data: { reactions: ReactionsContext } }
  | { type: "INIT"; data: { reactions: ReactionsContext } }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const allReactionsMachine = setup({
  types: {
    context: {} as AllReactionsContext,
    events: {} as AllReactionsEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `reactions-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setData: assign({
      reactions: ({ event }) => {
        if ("data" in event && "reactions" in event.data) {
          return event.data.reactions
        }
        return { message: {}, track: {} }
      },
    }),
    resetReactions: assign({
      reactions: () => ({ message: {}, track: {} }),
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "allReactions",
  initial: "idle",
  context: {
    reactions: {
      message: {},
      track: {},
    },
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetReactions"],
        },
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
    },
  },
})
