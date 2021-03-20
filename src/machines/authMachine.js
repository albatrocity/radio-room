import { Machine, assign, send, interpret } from "xstate"
import { get } from "lodash/fp"
import socketService from "../lib/socketService"
import { getCurrentUser, saveCurrentUser } from "../lib/getCurrentUser"
import { getPassword, savePassword } from "../lib/passwordOperations"

const getStoredUser = (ctx, event) =>
  new Promise((resolve, reject) => {
    const { currentUser, isNewUser, isAdmin } = getCurrentUser(
      get("data.username", event),
      ctx.password
    )
    resolve({ currentUser, isNewUser, isAdmin })
  })
const setStoredUser = (ctx, event) =>
  new Promise((resolve, reject) => {
    const { currentUser, isNewUser } = saveCurrentUser({
      currentUser: { username: event.data },
    })
    resolve({ currentUser, isNewUser })
  })
const getStoredPassword = (ctx, event) =>
  new Promise((resolve, reject) => {
    const password = getPassword(event.data)
    resolve({ password })
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
      password: null,
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    states: {
      unauthenticated: {
        entry: ["getStoredPassword", "checkPasswordRequirement"],
        on: {
          SET_PASSWORD_REQUIREMENT: [
            { target: "initiated", cond: "passwordAccepted" },
            { target: "unauthorized", cond: "requiresPassword" },
            { target: "initiated" },
          ],
        },
      },
      disconnected: {
        on: {
          "": {
            target: "initiated",
            cond: "shouldRetry",
          },
          SETUP: {
            target: "initiated",
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
          id: "setStoredUser",
          src: setStoredUser,
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
          UNAUTHORIZED: {
            target: "unauthorized",
          },
        },
        after: {
          3000: "connecting",
        },
      },
      authenticated: {
        on: {
          SETUP: {
            target: "connecting",
          },
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
            actions: ["activateAdmin", "saveUser"],
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
      authorizing: {
        invoke: {
          id: "getStoredPassword",
          src: getStoredPassword,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            target: "initiated",
          },
        },
      },
      unauthorized: {
        on: {
          SET_PASSWORD: {
            actions: ["savePassword", "submitPassword"],
          },
          SET_PASSWORD_ACCEPTED: [
            { actions: ["setPasswordError"], cond: "passwordRejected" },
            {
              actions: ["setPasswordError"],
              target: "initiated",
              cond: "passwordAccepted",
            },
          ],
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
          isAdmin: event.data.isAdmin,
        }
      }),
      unsetNew: assign((ctx, event) => {
        return {
          isNewUser: false,
        }
      }),
      login: send(
        (ctx, event) => {
          return {
            type: "login",
            data: { ...ctx.currentUser, password: ctx.password },
          }
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
      setPasswordError: assign({
        passwordError: (ctx, event) =>
          event.data.passwordAccepted ? null : "Password incorrect",
      }),
      getStoredPassword: assign({
        password: (ctx, event) => getPassword(),
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
      checkPasswordRequirement: send(
        (ctx, event) => ({
          type: "check password",
          data: ctx.password,
        }),
        {
          to: "socket",
        }
      ),
      submitPassword: send(
        (ctx, event) => ({
          type: "submit password",
          data: event.data,
        }),
        {
          to: "socket",
        }
      ),
      savePassword: savePassword,
      saveUser: saveCurrentUser,
    },
    guards: {
      shouldRetry: ctx => ctx.shouldRetry,
      shouldNotRetry: ctx => !ctx.shouldRetry,
      isAdmin: ctx => {
        return ctx.currentUser.isAdmin
      },
      requiresPassword: (ctx, event) => {
        return event.data.passwordRequired
      },
      passwordAccepted: (ctx, event) => {
        return event.data.passwordAccepted
      },
      passwordRejected: (ctx, event) => {
        return !event.data.passwordAccepted
      },
    },
  }
)

// export const authService = interpret(authMachine)
//
// authService.start()
