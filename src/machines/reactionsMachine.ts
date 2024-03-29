import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { isNil, find } from "lodash/fp"
import { ReactionSubject } from "../types/ReactionSubject"
import { Reaction } from "../types/Reaction"
import { getCurrentUser } from "../state/authStore"

interface Context {
  reactTo: ReactionSubject | null
  reactions: Reaction[]
}

export const reactionsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "reactions",
    initial: "closed",
    context: {
      reactTo: null,
      reactions: [],
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      REACTIONS: {
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
              cond: "reactionIsNew",
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
              cond: "reactionIsNew",
            },
            {
              target: "closed",
              actions: ["removeReaction"],
            },
          ],
        },
      },
    },
  },
  {
    actions: {
      setTargets: assign({
        reactTo: (context, event) => {
          if (event.data?.reactTo) {
            return event.data?.reactTo
          } else {
            return context.reactTo
          }
        },
      }),
      setData: assign({
        reactions: (context, event) => {
          if (context.reactTo) {
            return event.data.reactions
              ? event.data.reactions[context.reactTo?.type][context.reactTo?.id]
              : []
          }
          return []
        },
      }),
      setReactTo: assign({
        reactTo: (_context, event) => event.data.reactTo,
        reactions: (_context, event) => {
          return event.data.reactions ? event.data.reactions : []
        },
      }),
      addReaction: sendTo("socket", (ctx, event) => {
        const currentUser = getCurrentUser()
        return {
          type: "add reaction",
          data: {
            emoji: event.data,
            reactTo: ctx.reactTo,
            user: currentUser,
          },
        }
      }),
      removeReaction: sendTo("socket", (ctx, event) => {
        const currentUser = getCurrentUser()
        return {
          type: "remove reaction",
          data: {
            emoji: event.data,
            reactTo: ctx.reactTo,
            user: currentUser,
          },
        }
      }),
    },
    guards: {
      reactionIsNew: (ctx, event) => {
        const currentUser = getCurrentUser()
        return isNil(
          find(
            { user: currentUser?.userId, emoji: event.data.shortcodes },
            ctx.reactions,
          ),
        )
      },
    },
  },
)
