import { assign, sendTo, createMachine } from "xstate"
import { get } from "lodash/fp"
import socketService from "../lib/socketService"
import { getCurrentUser, saveCurrentUser } from "../lib/getCurrentUser"
import { getPassword, savePassword } from "../lib/passwordOperations"

import { User } from "../types/User"

export interface AuthContext {
  currentUser: User
  isNewUser: boolean
  isAdmin: boolean
  shouldRetry: boolean
  password?: string
  passwordError: string | undefined
}

function getStoredUser(ctx, event) {
  return new Promise((resolve, reject) => {
    const { currentUser, isNewUser, isAdmin } = getCurrentUser(
      get("data.username", event),
    )
    resolve({ currentUser, isNewUser, isAdmin })
  })
}
function setStoredUser(ctx, event: any) {
  return new Promise((resolve, reject) => {
    const user = getCurrentUser()
    const { currentUser, isNewUser } = saveCurrentUser({
      currentUser: { username: event.data, userId: user.currentUser.userId },
    })
    resolve({ currentUser, isNewUser })
  })
}
function getStoredPassword() {
  return new Promise((resolve) => {
    const password = getPassword()
    resolve({ password })
  })
}

interface Context {
  currentUser: User
  isNewUser: boolean
  isAdmin: boolean
  shouldRetry: boolean
  password?: string
}

export const authMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "auth",
    initial: "unauthenticated",
    context: {
      currentUser: {},
      isNewUser: false,
      isAdmin: false,
      shouldRetry: true,
      password: undefined,
    } as AuthContext,
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    states: {
      unauthenticated: {
        entry: ["getStoredPassword", "checkPasswordRequirement"],
        on: {
          TEST: {
            actions: ["log"],
          },
          SET_PASSWORD_REQUIREMENT: [
            { target: "initiated", cond: "passwordAccepted" },
            { target: "unauthorized", cond: "requiresPassword" },
            { target: "initiated" },
          ],
        },
      },
      disconnected: {
        on: {
          always: {
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
          DISCONNECT_USER: {
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
      log: (ctx, event) => {
        console.log("log", event)
      },
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
      login: sendTo("socket", (ctx, event) => {
        return {
          type: "login",
          data: { ...ctx.currentUser, password: ctx.password },
        }
      }),
      activateAdmin: assign((ctx, event) => {
        return {
          isAdmin: true,
          currentUser: { ...ctx.currentUser, isAdmin: true },
        }
      }),
      disableRetry: assign({
        shouldRetry: (context, event) => false,
      }),
      changeUsername: sendTo("socket", (ctx, event) => ({
        type: "change username",
        data: {
          userId: ctx.currentUser.userId,
          username: ctx.currentUser.username,
        },
      })),
      updateUsername: assign({
        currentUser: (ctx, event) => ({
          ...ctx.currentUser,
          username: event.data,
        }),
      }),
      setPasswordError: assign({
        passwordError: (_ctx, event) =>
          event.data.passwordAccepted ? null : "Password incorrect",
      }),
      getStoredPassword: assign({
        password: (_ctx, _event) => getPassword(),
      }),
      disconnectUser: sendTo("socket", (ctx) => ({
        type: "DISCONNECT_USER",
        data: ctx.currentUser.userId,
      })),
      kickUser: sendTo("socket", (_ctx, event) => ({
        type: "kick user",
        data: {
          userId: event.userId,
        },
      })),
      checkPasswordRequirement: sendTo("socket", (ctx) => ({
        type: "check password",
        data: ctx.password,
      })),
      submitPassword: sendTo("socket", (_ctx, event) => ({
        type: "submit password",
        data: event.data,
      })),
      savePassword: savePassword,
      saveUser: saveCurrentUser,
    },
    guards: {
      shouldRetry: (ctx) => ctx.shouldRetry,
      shouldNotRetry: (ctx) => !ctx.shouldRetry,
      isAdmin: (ctx) => {
        return !!ctx.currentUser.isAdmin
      },
      requiresPassword: (_ctx, event) => {
        return event.data.passwordRequired
      },
      passwordAccepted: (_ctx, event) => {
        return event.data.passwordAccepted
      },
      passwordRejected: (_ctx, event) => {
        return !event.data.passwordAccepted
      },
    },
  },
)
