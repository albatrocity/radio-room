import { Machine, send, assign } from "xstate"
import socketService from "../lib/socketService"
import { handleNotifications } from "../lib/handleNotifications"
import { take, concat } from "lodash/fp"

export const chatMachine = Machine(
  {
    id: "chat",
    initial: "unauthenticated",
    context: {
      messages: [],
      currentUser: null,
    },
    on: {
      LOGIN: {
        actions: ["setData"],
      },
      INIT: {
        actions: ["setData"],
      },
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    states: {
      unauthenticated: {
        on: {
          INIT: {
            target: "ready",
            actions: ["setData"],
          },
        },
      },
      ready: {
        type: "parallel",
        on: {
          SUBMIT_MESSAGE: { actions: ["sendMessage"] },
          NEW_MESSAGE: { actions: ["addMessage", "handleNotifications"] },
          SET_USERS: {
            actions: ["setCurrentUser"],
          },
        },
        states: {
          typing: {
            initial: "inactive",
            id: "typing",
            on: {
              START_TYPING: "typing.active",
              STOP_TYPING: "typing.inactive",
            },
            states: {
              active: {
                entry: ["startTyping"],
              },
              inactive: {
                entry: ["stopTyping"],
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {
      sendMessage: send(
        (ctx, event) => {
          return { type: "new message", data: event.data }
        },
        {
          to: "socket",
        }
      ),
      startTyping: send(
        (ctx, event) => {
          return { type: "typing" }
        },
        {
          to: "socket",
        }
      ),
      stopTyping: send(
        (ctx, event) => {
          return { type: "stop typing" }
        },
        {
          to: "socket",
        }
      ),
      setTyping: assign((ctx, event) => {
        return { typing: event.data }
      }),
      addMessage: assign({
        messages: (context, event) => {
          return take(60, concat(event.data, context.messages))
        },
      }),
      handleNotifications: (ctx, event) => {
        handleNotifications(event.data, ctx.currentUser)
      },
      setData: assign({
        messages: (context, event) => {
          return event.data.messages
        },
        typing: (context, event) => {
          return event.data.typing
        },
        currentUser: (context, event) => event.data.currentUser,
      }),
      setCurrentUser: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
            ? event.data.currentUser
            : context.currentUser
        },
      }),
    },
  }
)
