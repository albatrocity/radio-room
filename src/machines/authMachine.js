import { Machine, assign, send, interpret } from "xstate"
import { isNil } from "lodash/fp"
import socketService from "../lib/socketService"
import eventBus from "../lib/eventBus"
import { getCurrentUser } from "../lib/getCurrentUser"

const getStoredUser = (ctx, event) =>
  new Promise((resolve, reject) => {
    const { currentUser, isNewUser } = getCurrentUser(event.data)
    resolve({ currentUser, isNewUser })
  })

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
        on: {
          "": {
            target: "initiated",
            cond: "shouldRetry",
          },
        },
      },
      initiated: {
        invoke: {
          id: "getStoredUser",
          src: getStoredUser,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            target: "connecting",
            actions: ["setCurrentUser"],
          },
        },
      },
      updating: {
        invoke: {
          id: "getStoredUser",
          src: getStoredUser,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            target: "authenticated",
            actions: ["setCurrentUser"],
          },
        },
      },
      connecting: {
        entry: "login",
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
            actions: ["disconnectUser"],
            cond: "shouldNotRetry",
          },
          UPDATE_USERNAME: {
            actions: ["unsetNew", "updateUsername", "changeUsername"],
            target: "updating",
          },
          ACTIVATE_ADMIN: {
            actions: ["activateAdmin", "sendUser"],
          },
          REQUEST_CURRENT_USER: {
            actions: ["sendUser"],
          },
          KICK_USER: {
            actions: ["kickUser"],
            cond: "isAdmin",
          },
          disconnect: {
            target: "disconnected",
            actions: ["disconnectUser"],
          },
          KICKED: {
            target: "disconnected",
            actions: ["disableRetry", "disconnectUser"],
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
      unsetNew: assign((ctx, event) => {
        return {
          isNewUser: false,
        }
      }),
      login: send(
        (ctx, event) => {
          return { type: "login", data: ctx.currentUser }
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
      disableRetry: assign({
        shouldRetry: (context, event) => false,
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
      updateUsername: assign({
        currentUser: (ctx, event) => ({
          ...ctx.currentUser,
          username: event.data,
        }),
      }),
      disconnectUser: send(
        (ctx, event) => ({
          type: "disconnect",
          data: ctx.currentUser.userId,
        }),
        {
          to: "socket",
        }
      ),
      kickUser: send(
        (ctx, event) => ({
          type: "kick user",
          data: {
            userId: event.userId,
          },
        }),
        {
          to: "socket",
        }
      ),
    },
    guards: {
      shouldRetry: ctx => ctx.shouldRetry,
      shouldNotRetry: ctx => !ctx.shouldRetry,
      isAdmin: ctx => {
        console.log("isAdmin", ctx.currentUser)
        return ctx.currentUser.isAdmin
      },
    },
  }
)

// export const authService = interpret(authMachine)
//
// authService.start()
