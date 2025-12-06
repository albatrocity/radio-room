import { assign, setup } from "xstate"
import { isNil, find } from "lodash/fp"
import { ReactionSubject } from "../types/ReactionSubject"
import { Reaction } from "../types/Reaction"
import { getCurrentUser } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"

interface Context {
  reactTo: ReactionSubject | null
  reactions: Reaction[]
}

type ReactionsEvent =
  | { type: "REACTION_ADDED"; data: { reactions: Record<string, Record<string, Reaction[]>> } }
  | { type: "REACTION_REMOVED"; data: { reactions: Record<string, Record<string, Reaction[]>> } }
  | { type: "SET_REACT_TO"; data: { reactTo: ReactionSubject; reactions?: Reaction[] } }
  | { type: "TOGGLE"; data?: { reactTo?: ReactionSubject } }
  | { type: "CLOSE" }
  | { type: "SELECT_REACTION"; data: { shortcodes: string } }

export const reactionsMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ReactionsEvent,
  },
  actions: {
    setTargets: assign({
      reactTo: ({ context, event }) => {
        if (event.type === "TOGGLE" && event.data?.reactTo) {
          return event.data.reactTo
        }
        return context.reactTo
      },
    }),
    setData: assign({
      reactions: ({ context, event }) => {
        if (
          (event.type === "REACTION_ADDED" || event.type === "REACTION_REMOVED") &&
          context.reactTo &&
          event.data.reactions
        ) {
          const typeReactions = event.data.reactions[context.reactTo.type]
          return typeReactions?.[context.reactTo.id] || []
        }
        return []
      },
    }),
    setReactTo: assign({
      reactTo: ({ event }) => {
        if (event.type === "SET_REACT_TO") {
          return event.data.reactTo
        }
        return null
      },
      reactions: ({ event }) => {
        if (event.type === "SET_REACT_TO") {
          return event.data.reactions ? event.data.reactions : []
        }
        return []
      },
    }),
    addReaction: ({ context, event }) => {
      if (event.type !== "SELECT_REACTION") return
      const currentUser = getCurrentUser()
      emitToSocket("ADD_REACTION", {
        emoji: event.data,
        reactTo: context.reactTo,
        user: currentUser,
      })
    },
    removeReaction: ({ context, event }) => {
      if (event.type !== "SELECT_REACTION") return
      const currentUser = getCurrentUser()
      emitToSocket("REMOVE_REACTION", {
        emoji: event.data,
        reactTo: context.reactTo,
        user: currentUser,
      })
    },
  },
  guards: {
    reactionIsNew: ({ context, event }) => {
      if (event.type !== "SELECT_REACTION") return false
      const currentUser = getCurrentUser()
      return isNil(
        find({ user: currentUser?.userId, emoji: event.data.shortcodes }, context.reactions),
      )
    },
  },
}).createMachine({
  id: "reactions",
  initial: "closed",
  context: {
    reactTo: null,
    reactions: [],
  },
  on: {
    REACTION_ADDED: {
      actions: ["setData"],
    },
    REACTION_REMOVED: {
      actions: ["setData"],
    },
    SET_REACT_TO: {
      actions: ["setReactTo"],
    },
  },
  states: {
    closed: {
      on: {
        TOGGLE: "open",
        SELECT_REACTION: [
          {
            target: "closed",
            actions: ["addReaction"],
            guard: "reactionIsNew",
          },
          {
            target: "closed",
            actions: ["removeReaction"],
          },
        ],
      },
    },
    open: {
      entry: "setTargets",
      on: {
        TOGGLE: "closed",
        CLOSE: "closed",
        SELECT_REACTION: [
          {
            target: "closed",
            actions: ["addReaction"],
            guard: "reactionIsNew",
          },
          {
            target: "closed",
            actions: ["removeReaction"],
          },
        ],
      },
    },
  },
})
