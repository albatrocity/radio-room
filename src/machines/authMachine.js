import { Machine, assign, send } from "xstate"
import { isNil } from "lodash/fp"
import socketService from "../lib/socketService"
import eventBus from "../lib/eventBus"

export const authMachine = Machine(
  {
    id: "auth",
    initial: "unauthenticated",
    context: {
      currentUser: {},
      isNewUser: false,
      isAdmin: false,
      shouldRetry: true,
    },
    invoke: [
      {
        id: "eventBus",
        src: (ctx, event) => eventBus,
      },
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    states: {
      unauthenticated: {
        on: {
          SETUP: { target: "initiated" },
        },
      },
      disconnected: {
        entry: [() => console.log("disconnected entry")],
        on: {
          "": {
            target: "initiated",
            cond: "shouldRetry",
          },
        },
      },
      initiated: {
        entry: ["getCurrentUser"],
        on: {
          CREDENTIALS: {
            target: "connecting",
            actions: ["setCurrentUser", "sendUser", "login"],
          },
        },
      },
      editingUsername: {
        on: {
          CREDENTIALS: {
            target: "connecting",
            actions: ["setCurrentUser", "changeUsername"],
          },
        },
      },
      connecting: {
        on: {
          INIT: {
            target: "authenticated",
          },
        },
        after: {
          3000: "connecting",
        },
      },
      authenticated: {
        on: {
          USER_DISCONNECTED: {
            target: "disconnected",
            actions: ["setRetry", "disconnectUser"],
          },
          UPDATE_USERNAME: {
            target: "editingUsername",
            actions: ["unsetNew", "getCurrentUser"],
          },
          ACTIVATE_ADMIN: {
            actions: ["activateAdmin"],
          },
          disconnect: {
            target: "disconnected",
            actions: ["setRetry", "disconnectUser"],
          },
          kicked: {
            target: "disconnected",
            actions: ["disconnectUser"],
          },
        },
      },
    },
  },
  {
    actions: {
      setCurrentUser: assign((ctx, event) => {
        return {
          currentUser: event.data.currentUser,
          isNewUser: event.data.isNewUser,
        }
      }),
      sendUser: send(
        (ctx, event) => {
          return {
            type: "SET_CURRENT_USER",
            data: {
              currentUser: {
                userId: ctx.currentUser.userId,
                username: ctx.currentUser.username,
              },
            },
          }
        },
        {
          to: "eventBus",
        }
      ),
      unsetNew: assign((ctx, event) => {
        return {
          isNewUser: false,
        }
      }),
      login: send(
        (ctx, event) => {
          return { type: "login", data: event.data.currentUser }
        },
        {
          to: "socket",
        }
      ),
      activateAdmin: assign((ctx, event) => {
        return {
          isAdmin: true,
          currentUser: { ...ctx.currentUser, isAdmin: true },
        }
      }),
      setRetry: assign({
        shouldRetry: (context, event) => {
          return isNil(event.shouldRetry) ? true : event.shouldRetry
        },
      }),
      changeUsername: send(
        (ctx, event) => ({
          type: "change username",
          data: {
            userId: ctx.currentUser.userId,
            username: ctx.currentUser.username,
          },
        }),
        {
          to: "socket",
        }
      ),
    },
    guards: {
      shouldRetry: ctx => ctx.shouldRetry,
    },
  }
)
