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
      type: "USER_KICKED"
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
      data: { attemptNumber: number }
    }
  | {
      type: "SOCKET_DISCONNECTED"
      data: { reason?: string }
    }
  | {
      type: "SOCKET_CONNECTED"
    }
  | {
      type: "SOCKET_CONNECTING"
    }
  | {
      type: "SOCKET_ERROR"
      data: { error?: string }
    }
  | {
      type: "SOCKET_RECONNECTING"
      data: { attemptNumber: number }
    }
  | {
      type: "SOCKET_RECONNECT_FAILED"
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
  // Note: Most socket lifecycle events are now handled in socketService.ts
  // This is just for any additional auth-specific socket monitoring if needed
  
  // Listen for visibility changes to detect tab backgrounding
  if (typeof document !== "undefined") {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("[Auth] Tab hidden")
      } else {
        console.log("[Auth] Tab visible, checking connection...")
        // Check if socket is still connected when returning to tab
        if (!socket.connected) {
          console.log("[Auth] Socket disconnected, triggering reconnection")
          callback({ type: "SOCKET_DISCONNECTED", data: { reason: "visibility_change" } })
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }
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
        entry: ["getStoredPassword"],
        on: {
          SET_PASSWORD_REQUIREMENT: [
            { target: "connecting", cond: "hasStoredPasswordAndPasswordAccepted" },
            { target: "unauthorized", cond: "requiresPassword" },
            { target: "connecting" },
          ],
        },
      },
      disconnected: {
        entry: ["showDisconnectedToast"],
        on: {
          SETUP: {
            target: "retrieving",
            actions: ["setRoomId"],
          },
          SOCKET_RECONNECTED: {
            target: "retrieving",
            actions: ["showReconnectedToast"],
          },
          SOCKET_RECONNECTING: {
            actions: ["showReconnectingToast"],
          },
          SOCKET_RECONNECT_FAILED: {
            actions: ["showReconnectFailedToast"],
          },
        },
      },
      retrieving: {
        entry: ["getStoredPassword"],
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
          SOCKET_DISCONNECTED: {
            target: "disconnected",
            actions: ["logDisconnect"],
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
          USER_KICKED: {
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
            actions: ["setPasswordInContext", "savePassword", "submitPassword"],
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
        // Get user data from stored user or current user
        let userId: string | undefined
        let username: string | undefined
        
        if (event.type === "done.invoke.getStoredUser") {
          userId = event.data.currentUser?.userId
          username = event.data.currentUser?.username
        } else {
          // When coming from password acceptance, use current user data
          userId = ctx.currentUser?.userId
          username = ctx.currentUser?.username
        }

        const password = ctx.password
        return {
          type: "LOGIN",
          data: {
            fetchAllData: !ctx.initialized,
            userId,
            username,
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
        type: "CHANGE_USERNAME",
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
      setPasswordInContext: assign({
        password: (_ctx, event) => {
          if (event.type !== "SET_PASSWORD") return _ctx.password
          return event.data
        },
      }),
      getStoredPassword: assign({
        password: (_ctx, _event) => getPassword(),
      }),
      disconnectUser: sendTo("socket", (ctx) => ({
        type: "USER_LEFT",
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
        return { type: "NUKE_USER" }
      }),
      kickUser: sendTo("socket", (_ctx, event) => {
        if (event.type !== "KICK_USER") return

        return {
          type: "KICK_USER",
          data: {
            userId: event.userId,
          },
        }
      }),
      checkPasswordRequirement: sendTo("socket", (ctx) => {
        // Only check password if one exists in context
        if (!ctx.password) {
          return { type: "noop" }
        }
        return {
          type: "CHECK_PASSWORD",
          data: ctx.password,
        }
      }),
      submitPassword: sendTo("socket", (ctx, event) => {
        if (event.type !== "SET_PASSWORD") return
        return {
          type: "SUBMIT_PASSWORD",
          data: {
            password: event.data,
            roomId: ctx.roomId,
          },
        }
      }),
      setRoomId: assign({
        roomId: (ctx, event) => {
          if (event.type !== "SETUP") return ctx.roomId
          return event.data.roomId
        },
      }),
      savePassword: savePassword,
      logDisconnect: (_ctx, event) => {
        if (event.type === "SOCKET_DISCONNECTED") {
          console.log("[Auth] Socket disconnected, reason:", event.data.reason)
        }
      },
      showDisconnectedToast: () => {
        toast({
          title: "Connection lost",
          description: "Attempting to reconnect...",
          status: "warning",
          duration: null,
          isClosable: false,
          id: "connection-status",
        })
      },
      showReconnectingToast: (_ctx, event) => {
        if (event.type === "SOCKET_RECONNECTING") {
          toast({
            title: "Reconnecting...",
            description: `Attempt ${event.data.attemptNumber}`,
            status: "info",
            duration: 2000,
            isClosable: false,
            id: "connection-status",
          })
        }
      },
      showReconnectedToast: () => {
        toast({
          title: "Reconnected!",
          description: "Connection restored",
          status: "success",
          duration: 3000,
          isClosable: true,
          id: "connection-status",
        })
      },
      showReconnectFailedToast: () => {
        toast({
          title: "Connection failed",
          description: "Unable to reconnect. Please refresh the page.",
          status: "error",
          duration: null,
          isClosable: true,
          id: "connection-status",
        })
      },
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
      hasStoredPasswordAndPasswordAccepted: (ctx, event) => {
        if (event.type !== "SET_PASSWORD_REQUIREMENT") return false
        // Only bypass password prompt if:
        // 1. Room doesn't require a password, OR
        // 2. Room requires password AND we have a stored password AND it's accepted
        return !event.data.passwordRequired || 
               (event.data.passwordRequired && 
                !!ctx.password && 
                event.data.passwordAccepted === true)
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
