import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { isNil, find } from "lodash/fp"
import { ReactionSubject } from "../types/ReactionSubject"
import { Reaction } from "../types/Reaction"
import { User } from "../types/User"

interface Context {
  reactTo: ReactionSubject | null
  reactions: Reaction[]
  currentUser: User | null
}

export const reactionsMachine = createMachine<Context>(
  {
    id: "reactions",
    initial: "closed",
    context: {
      reactTo: null,
      reactions: [],
      currentUser: null,
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
      SET_USERS: {
        actions: ["setCurrentUser"],
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
          return event.data.reactions
            ? event.data.reactions[event.data.reactTo.id]
            : []
        },
      }),
      setCurrentUser: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
            ? event.data.currentUser
            : context.currentUser
        },
      }),
      addReaction: send(
        (ctx, event) => ({
          type: "add reaction",
          data: {
            emoji: event.data,
            reactTo: ctx.reactTo,
            user: ctx.currentUser,
          },
        }),
        {
          to: "socket",
        },
      ),
      removeReaction: send(
        (ctx, event) => ({
          type: "remove reaction",
          data: {
            emoji: event.data,
            reactTo: ctx.reactTo,
            user: ctx.currentUser,
          },
        }),
        {
          to: "socket",
        },
      ),
    },
    guards: {
      reactionIsNew: (ctx, event) => {
        return isNil(
          find(
            { user: ctx.currentUser?.userId, emoji: event.data.shortcodes },
            ctx.reactions,
          ),
        )
      },
    },
  },
)
