import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import socket from "../lib/socket"
import {
  saveCurrentUser,
  clearCurrentUser,
  getCurrentUser,
} from "../lib/getCurrentUser"
import { getSessionUser, logout } from "../lib/serverApi"
import { getPassword, savePassword } from "../lib/passwordOperations"

import { User } from "../types/User"
import { Reaction } from "../types/Reaction"
import { PlaylistItem } from "../types/PlaylistItem"
import { ChatMessage } from "../types/ChatMessage"
import { RoomMeta } from "../types/Room"
import { SocketCallback } from "../types/SocketCallback"
import { toast } from "../lib/toasts"
export interface AuthContext {
  currentUser?: User
  isNewUser: boolean
  isAdmin: boolean
  shouldRetry: boolean
  password?: string
  passwordError: string | undefined
  roomId?: string
  initialized: boolean
}

type AuthEvent =
  | {
      type: "SETUP"
      data: {
        roomId: string
      }
    }
  | {
      type: "done.invoke.getStoredUser"
      data: {
        currentUser: User
      }
    }
  | {
      type: "LOGOUT"
    }
  | {
      type: "SESSION_ENDED"
    }
  | {
      type: "NUKE_USER"
    }
  | {
      type: "ACTIVATE_ADMIN"
    }
  | {
      type: "GET_SESSION_USER"
    }
  | {
      type: "KICK_USER"
      userId: string
    }
  | {
      type: "KICKED"
    }
  | {
      type: "SET_PASSWORD"
      data: string
    }
  | {
      type: "SET_PASSWORD_ACCEPTED"
      data: {
        passwordAccepted: boolean
      }
    }
  | {
      type: "SET_PASSWORD_REQUIREMENT"
      data: {
        passwordRequired: boolean
      }
    }
  | {
      type: "UPDATE_USERNAME"
      data: string
    }
  | {
      type: "UPDATE_PASSWORD"
      data: string
    }
  | {
      type: "USER_DISCONNECTED"
    }
  | {
      type: "USER_CONNECTED"
    }
  | {
      type: "UNAUTHORIZED"
    }
  | {
      type: "INIT"
      data: {
        users: User[]
        user: User
        messages: ChatMessage[]
        meta: RoomMeta
        reactions: {
          message: Record<string, Reaction[]>
          track: Record<string, Reaction[]>
        }
        playlist: PlaylistItem[]
        passwordRequired: boolean
        accessToken: string | null
        isNewUser: boolean
      }
    }
  | {
      type: "SOCKET_RECONNECTED"
    }
  | {
      type: "SOCKET_DISCONNECTED"
    }
  | {
      type: "SOCKET_CONNECTED"
    }
  | {
      type: "SOCKET_CONNECTING"
    }
  | {
      type: "SOCKET_ERROR"
      data: string
    }
  | {
      type: "SOCKET_RECONNECTING"
    }
  | {
      type: "done.invoke.getSessionUser"
      data: {
        user: User
        isNewUser: boolean
      }
    }

function setStoredUser(ctx: AuthContext, event: AuthEvent) {
  return new Promise((resolve) => {
    if (event.type !== "INIT") {
      return resolve(ctx.currentUser)
    }

    const { currentUser, isNewUser } = saveCurrentUser({
      currentUser: event.data.user,
    })
    resolve({ currentUser, isNewUser })
  })
}

function getStoredUser() {
  return new Promise((resolve) => {
    const { currentUser } = getCurrentUser()
    resolve({ currentUser })
  })
}

function socketEventService(callback: SocketCallback) {
  socket.io.on("reconnect", () => {
    callback({ type: "SOCKET_RECONNECTED", data: {} })
  })
  socket.io.on("error", () => {
    callback({ type: "SOCKET_ERROR", data: {} })
  })
}

export const authMachine = createMachine<AuthContext, AuthEvent>(
  {
    predictableActionArguments: true,
    id: "auth",
    initial: "idle",
    context: {
      isNewUser: false,
      isAdmin: false,
      shouldRetry: true,
      password: undefined,
      passwordError: undefined,
      roomId: undefined,
      initialized: false,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
      {
        id: "socketEventService",
        src: () => socketEventService,
      },
    ],
    on: {
      GET_SESSION_USER: "fetching",
      LOGOUT: {
        target: "loggingOut",
        actions: ["clearSession"],
      },
      SETUP: {
        target: "retrieving",
        actions: ["setRoomId"],
      },
    },
    states: {
      idle: {},
      fetching: {
        invoke: {
          id: "getSessionUser",
          src: getSessionUser,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            target: "authenticated",
            actions: ["setCurrentUser"],
          },
        },
      },
      unauthenticated: {
        entry: ["getStoredPassword", "checkPasswordRequirement"],
        on: {
          SET_PASSWORD_REQUIREMENT: [
            { target: "connecting", cond: "passwordAccepted" },
            { target: "unauthorized", cond: "requiresPassword" },
          ],
        },
      },
      disconnected: {
        on: {
          SETUP: {
            target: "retrieving",
            actions: ["setRoomId"],
          },
          SOCKET_RECONNECTED: {
            target: "retrieving",
          },
        },
      },
      retrieving: {
        invoke: {
          id: "getStoredUser",
          src: getStoredUser,
          onDone: {
            target: "connecting",
          },
          onError: {
            target: "connecting",
          },
        },
      },
      connecting: {
        entry: "login",
        on: {
          INIT: [
            {
              target: "authenticated",
              actions: ["activateAdmin", "setCurrentUser", "assignInitialized"],
              cond: "isRoomAdmin",
            },
            {
              target: "authenticated",
              actions: ["setCurrentUser", "saveUser", "assignInitialized"],
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
        on: {
          SETUP: {
            target: "retrieving",
            actions: ["setRoomId", "setCurrentUser"],
          },
          USER_DISCONNECTED: {
            target: "disconnected",
            actions: ["disconnectUser"],
          },
          UPDATE_USERNAME: {
            actions: [
              "unsetNew",
              "updateUsername",
              "changeUsername",
              (ctx, event) => {
                saveCurrentUser({
                  currentUser: { ...ctx.currentUser, username: event.data },
                })
              },
            ],
          },
          ACTIVATE_ADMIN: {
            actions: ["activateAdmin"],
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
          NUKE_USER: {
            target: "loggingOut",
            actions: [
              "clearSession",
              "nukeUser",
              () => {
                toast({
                  status: "success",
                  title: "Spotify Disconnected",
                  description:
                    "Your Spotify account details and room data have been permanently deleted from our servers. Thanks for playing!",
                })
              },
            ],
          },
          SESSION_ENDED: {
            target: "loggingOut",
            actions: ["clearSession"],
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
              target: "connecting",
              cond: "passwordAccepted",
            },
          ],
        },
      },
      loggingOut: {
        invoke: {
          id: "logout",
          src: logout,
          onDone: {
            target: "idle",
            actions: [
              "clearSession",
              () => {
                window.location.reload()
              },
            ],
          },
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
      assignInitialized: assign({
        initialized: () => true,
      }),
      setCurrentUser: assign((ctx, event) => {
        if (
          event.type === "done.invoke.getSessionUser" ||
          event.type === "INIT"
        ) {
          return {
            currentUser: event.data.user,
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
        if (event.type !== "done.invoke.getStoredUser") {
          return {}
        }

        const password = ctx.password
        return {
          type: "login",
          data: {
            fetchAllData: !ctx.initialized,
            userId: event.data.currentUser.userId,
            username: event.data.currentUser.username,
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
        currentUser: (ctx, event) => {
          if (event.type !== "UPDATE_USERNAME") return ctx.currentUser

          return (
            ctx.currentUser && {
              ...ctx.currentUser,
              username: event.data,
            }
          )
        },
      }),
      saveUser: (ctx, event) => {
        setStoredUser(ctx, event)
      },
      setPasswordError: assign({
        passwordError: (_ctx, event) => {
          if (event.type !== "SET_PASSWORD_ACCEPTED") return undefined
          if (event.data === undefined) return undefined
          return "Password incorrect"
        },
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
      clearSession: assign(() => {
        clearCurrentUser()
        return {
          currentUser: undefined,
          isNewUser: true,
          isAdmin: false,
          shouldRetry: true,
          roomId: undefined,
        }
      }),
      nukeUser: sendTo("socket", () => {
        return { type: "nuke user" }
      }),
      kickUser: sendTo("socket", (_ctx, event) => {
        if (event.type !== "KICK_USER") return

        return {
          type: "kick user",
          data: {
            userId: event.userId,
          },
        }
      }),
      checkPasswordRequirement: sendTo("socket", (ctx) => ({
        type: "check password",
        data: ctx.password,
      })),
      submitPassword: sendTo("socket", (_ctx, event) => {
        if (event.type !== "SET_PASSWORD") return
        return {
          type: "submit password",
          data: event.data,
        }
      }),
      setRoomId: assign({
        roomId: (ctx, event) => {
          if (event.type !== "SETUP") return ctx.roomId
          return event.data.roomId
        },
      }),
      savePassword: savePassword,
    },
    guards: {
      shouldRetry: (ctx) => ctx.shouldRetry,
      shouldNotRetry: (ctx) => !ctx.shouldRetry,
      isRoomAdmin: (_ctx, event) => {
        return event.type === "INIT" && !!event.data.user?.isAdmin
      },
      isAdmin: (ctx) => {
        return !!ctx.currentUser?.isAdmin
      },
      requiresPassword: (_ctx, event) => {
        if (event.type !== "SET_PASSWORD_REQUIREMENT") return false
        return event.data.passwordRequired
      },
      passwordAccepted: (_ctx, event) => {
        if (event.type !== "SET_PASSWORD_ACCEPTED") return false
        return event.data.passwordAccepted
      },
      passwordRejected: (_ctx, event) => {
        if (event.type !== "SET_PASSWORD_ACCEPTED") return false
        return !event.data.passwordAccepted
      },
    },
  },
)
