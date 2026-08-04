import { setup, assign } from "xstate"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export type ReactionsContext = Record<ReactionSubject["type"], Record<string, Reaction[]>>

export interface AllReactionsContext {
  reactions: ReactionsContext
  subscriptionId: string | null
}

type ReactionDeltaPayload = {
  reaction: {
    emoji: { shortcodes: string } | string
    reactTo: ReactionSubject
    user: { userId: string } | string
  }
}

type AllReactionsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REACTION_ADDED"; data: ReactionDeltaPayload }
  | { type: "REACTION_REMOVED"; data: ReactionDeltaPayload }
  | { type: "INIT"; data: { reactions: ReactionsContext } }

// ============================================================================
// Helpers
// ============================================================================

function emptyStore(): ReactionsContext {
  return { message: {}, track: {} }
}

function emojiCode(emoji: { shortcodes: string } | string): string {
  return typeof emoji === "string" ? emoji : emoji.shortcodes
}

function userIdOf(user: { userId: string } | string): string {
  return typeof user === "string" ? user : user.userId
}

function patchAdd(store: ReactionsContext, data: ReactionDeltaPayload): ReactionsContext {
  const { reaction } = data
  const type = reaction.reactTo.type
  const id = reaction.reactTo.id
  const entry: Reaction = {
    emoji: emojiCode(reaction.emoji),
    user: userIdOf(reaction.user),
  }
  const existing = store[type]?.[id] ?? []
  if (existing.some((r) => r.emoji === entry.emoji && r.user === entry.user)) {
    return store
  }
  return {
    ...store,
    [type]: {
      ...store[type],
      [id]: [...existing, entry],
    },
  }
}

function patchRemove(store: ReactionsContext, data: ReactionDeltaPayload): ReactionsContext {
  const { reaction } = data
  const type = reaction.reactTo.type
  const id = reaction.reactTo.id
  const emoji = emojiCode(reaction.emoji)
  const userId = userIdOf(reaction.user)
  const existing = store[type]?.[id] ?? []
  const next = existing.filter((r) => !(r.emoji === emoji && r.user === userId))
  return {
    ...store,
    [type]: {
      ...store[type],
      [id]: next,
    },
  }
}

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
      subscribeById(id, {
        send: (event) => self.send(event),
        eventTypes: ["REACTION_ADDED", "REACTION_REMOVED", "INIT"],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setData: assign({
      reactions: ({ event }) => {
        if (event.type === "INIT" && event.data.reactions) {
          return event.data.reactions
        }
        return emptyStore()
      },
    }),
    applyAdded: assign({
      reactions: ({ context, event }) => {
        if (event.type !== "REACTION_ADDED") return context.reactions
        return patchAdd(context.reactions, event.data)
      },
    }),
    applyRemoved: assign({
      reactions: ({ context, event }) => {
        if (event.type !== "REACTION_REMOVED") return context.reactions
        return patchRemove(context.reactions, event.data)
      },
    }),
    resetReactions: assign({
      reactions: () => emptyStore(),
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "allReactions",
  initial: "idle",
  context: {
    reactions: emptyStore(),
    subscriptionId: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetReactions"],
        },
        REACTION_ADDED: {
          actions: ["applyAdded"],
        },
        REACTION_REMOVED: {
          actions: ["applyRemoved"],
        },
        INIT: {
          actions: ["setData"],
        },
      },
    },
  },
})
