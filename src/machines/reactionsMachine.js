import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { isNil, find } from "lodash/fp"

export const reactionsMachine = createMachine(
  {
    id: "reactions",
    initial: "closed",
    context: {
      dropRef: null,
      reactTo: null,
      reactions: [],
      currentUser: {},
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
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
      setTyping: assign({
        typing: (context, event) => {
          return event.data.typing
        },
      }),
      setTargets: assign({
        dropRef: (context, event) => {
          if (event.data?.ref) {
            return event.data.ref
          } else {
            return context.dropRef
          }
        },
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
          return event.data.reactions
            ? event.data.reactions[context.reactTo.type][context.reactTo.id]
            : []
        },
      }),
      setReactTo: assign({
        reactTo: (context, event) => event.data.reactTo,
        reactions: (context, event) => {
          return event.data.reactions
            ? event.data.reactions[event.data.reactTo.type][
                event.data.reactTo.id
              ]
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
            { user: ctx.currentUser.userId, emoji: event.data.shortcodes },
            ctx.reactions,
          ),
        )
      },
    },
  },
)
