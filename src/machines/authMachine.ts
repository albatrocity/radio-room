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
      SOCKET_RECONNECTED: {
        target: "initiated",
        cond: "shouldRetry",
      },
    },
    states: {
      idle: {
        invoke: {
          id: "getStoredUser",
          src: getStoredUser,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            actions: ["setCurrentUser"],
          },
        },
        on: {
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
          INIT: [
            {
              target: "authenticated",
              actions: ["activateAdmin", "setCurrentUser", "saveUser"],
              cond: "isRoomAdmin",
            },
            {
              target: "authenticated",
            },
          ],
          UNAUTHORIZED: {
            target: "unauthorized",
          },
        },
        after: {
          3000: "connecting",
        },
      },
      authenticated: {
        entry: ["saveUser"],
        on: {
          SETUP: {
            target: "connecting",
            actions: ["setRoomId", "setCurrentUser"],
          },
          USER_DISCONNECTED: {
            target: "disconnected",
            actions: ["disconnectUser"],
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
          KICKED: {
            target: "disconnected",
            actions: ["disableRetry", "disconnectUser"],
          },
          SOCKET_ERROR: {
            target: "disconnected",
          },
          SOCKET_RECONNECTED: {
            target: "idle",
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
              actions: ["setPasswordError", "setNew"],
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
        console.log("ctx", ctx)
        console.log("event", event)
      },
      setCurrentUser: assign((ctx, event) => {
        if (
          event.type === "done.invoke.getStoredUser" ||
          event.type === "INIT"
        ) {
          return {
            currentUser: event.data.currentUser,
            isNewUser: event.data.isNewUser,
          }
        }
        return ctx
      }),
      unsetNew: assign(() => {
        return {
          isNewUser: false,
        }
      }),
      setNew: assign(() => {
        return {
          isNewUser: true,
        }
      }),
      login: sendTo("socket", (ctx, event) => {
        const password = ctx.password ?? event?.data?.currentUser?.password
        return {
          type: "login",
          data: {
            ...ctx.currentUser,
            password: password,
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
        type: "user left",
        data: {
          userId: ctx.currentUser?.userId,
          roomId: ctx.roomId,
        },
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
      isRoomAdmin: (_ctx, event) => {
        return event.type === "INIT" && !!event.data.currentUser?.isAdmin
      },
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
