import { assign, sendTo, createMachine, AnyEventObject } from "xstate"
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
  roomId?: string
}

function getStoredUser(_ctx: AuthContext, event: AnyEventObject) {
  return new Promise((resolve) => {
    const { currentUser, isNewUser, isAdmin } = getCurrentUser(
      get("data.username", event),
    )
    resolve({ currentUser, isNewUser, isAdmin })
  })
}
function setStoredUser(_ctx: AuthContext, event: AnyEventObject) {
  return new Promise((resolve) => {
    const user = getCurrentUser()
    const { currentUser, isNewUser } = saveCurrentUser({
      currentUser: {
        username: event.data,
        userId: user.currentUser.userId,
      },
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

export const authMachine = createMachine<AuthContext>(
  {
    predictableActionArguments: true,
    id: "auth",
    initial: "idle",
    context: {
      currentUser: {
        userId: "",
      },
      isNewUser: false,
      isAdmin: false,
      shouldRetry: true,
      password: undefined,
      passwordError: undefined,
      roomId: undefined,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      SET_CURRENT_USER: {
        actions: ["saveUser", "setCurrentUser"],
      },
    },
    states: {
      idle: {
        on: {
          SETUP: {
            target: "initiated",
            actions: ["setRoomId"],
          },
        },
      },
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
          always: {
            target: "initiated",
            cond: "shouldRetry",
          },
          SETUP: {
            target: "initiated",
            actions: ["setRoomId"],
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
            actions: ["setRoomId"],
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
      setCurrentUser: assign((_ctx, event) => {
        return {
          currentUser: event.data.currentUser,
          isNewUser: event.data.isNewUser,
          isAdmin: event.data.isAdmin,
        }
      }),
      unsetNew: assign(() => {
        return {
          isNewUser: false,
        }
      }),
      login: sendTo("socket", (ctx) => {
        return {
          type: "login",
          data: {
            ...ctx.currentUser,
            password: ctx.password,
            roomId: ctx.roomId,
          },
        }
      }),
      activateAdmin: assign({
        isAdmin: true,
        currentUser: (ctx) =>
          ctx.currentUser
            ? { ...ctx.currentUser, isAdmin: true }
            : { userId: "" },
      }),
      disableRetry: assign({
        shouldRetry: () => false,
      }),
      changeUsername: sendTo("socket", (ctx) => ({
        type: "change username",
        data: ctx.currentUser
          ? {
              userId: ctx.currentUser.userId,
              username: ctx.currentUser.username,
            }
          : null,
      })),
      updateUsername: assign({
        currentUser: (ctx, event) =>
          ctx.currentUser && {
            ...ctx.currentUser,
            username: event.data,
          },
      }),
      setPasswordError: assign({
        passwordError: (_ctx, event) =>
          event.data.passwordAccepted ? undefined : "Password incorrect",
      }),
      getStoredPassword: assign({
        password: (_ctx, _event) => getPassword(),
      }),
      disconnectUser: sendTo("socket", (ctx) => ({
        type: "DISCONNECT_USER",
        data: ctx.currentUser?.userId,
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
      setRoomId: assign({
        roomId: (ctx, event) => {
          if (event.type !== "SETUP") return ctx.roomId
          return event.data.roomId
        },
      }),
      savePassword: savePassword,
      saveUser: saveCurrentUser,
    },
    guards: {
      shouldRetry: (ctx) => ctx.shouldRetry,
      shouldNotRetry: (ctx) => !ctx.shouldRetry,
      isAdmin: (ctx) => {
        return !!ctx.currentUser?.isAdmin
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
