import { assign, setup, fromCallback, fromPromise } from "xstate"
import socket from "../lib/socket"
import { saveCurrentUser, clearCurrentUser, getCurrentUser } from "../lib/getCurrentUser"
import { getSessionUser, logout } from "../lib/serverApi"
import { getPassword, savePassword } from "../lib/passwordOperations"
import { emitToSocket } from "../actors/socketActor"

import { User } from "../types/User"
import { Reaction } from "../types/Reaction"
import { PlaylistItem } from "../types/PlaylistItem"
import { ChatMessage } from "../types/ChatMessage"
import { RoomMeta } from "../types/Room"
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
  | { type: "SETUP"; data: { roomId: string } }
  | { type: "xstate.done.actor.getStoredUser"; output: { currentUser: User } }
  | { type: "xstate.done.actor.getSessionUser"; output: { user: User; isNewUser: boolean } }
  | { type: "xstate.done.actor.logout"; output: void }
  | { type: "LOGOUT" }
  | { type: "SESSION_ENDED" }
  | { type: "NUKE_USER" }
  | { type: "ACTIVATE_ADMIN" }
  | { type: "GET_SESSION_USER" }
  | { type: "KICK_USER"; userId: string }
  | { type: "USER_KICKED" }
  | { type: "SET_PASSWORD"; data: string }
  | { type: "SET_PASSWORD_ACCEPTED"; data: { passwordAccepted: boolean } }
  | { type: "SET_PASSWORD_REQUIREMENT"; data: { passwordRequired: boolean; passwordAccepted?: boolean } }
  | { type: "UPDATE_USERNAME"; data: string }
  | { type: "UPDATE_PASSWORD"; data: string }
  | { type: "USER_DISCONNECTED" }
  | { type: "USER_CONNECTED" }
  | { type: "UNAUTHORIZED" }
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
  | { type: "SOCKET_RECONNECTED"; data: { attemptNumber: number } }
  | { type: "SOCKET_DISCONNECTED"; data: { reason?: string } }
  | { type: "SOCKET_CONNECTED" }
  | { type: "SOCKET_CONNECTING" }
  | { type: "SOCKET_ERROR"; data: { error?: string } }
  | { type: "SOCKET_RECONNECTING"; data: { attemptNumber: number } }
  | { type: "SOCKET_RECONNECT_FAILED" }

// Visibility callback actor
const visibilityLogic = fromCallback<AuthEvent>(({ sendBack }) => {
  if (typeof document !== "undefined") {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("[Auth] Tab hidden")
      } else {
        console.log("[Auth] Tab visible, checking connection...")
        if (!socket.connected) {
          console.log("[Auth] Socket disconnected, triggering reconnection")
          sendBack({ type: "SOCKET_DISCONNECTED", data: { reason: "visibility_change" } })
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }
  return () => {}
})

// Get stored user promise actor
const getStoredUserLogic = fromPromise<{ currentUser: User | null }>(async () => {
  const { currentUser } = getCurrentUser()
  return { currentUser }
})

// Get session user promise actor
const getSessionUserLogic = fromPromise<{ user: User; isNewUser: boolean }>(async () => {
  return await getSessionUser()
})

// Logout promise actor
const logoutLogic = fromPromise<void>(async () => {
  return await logout()
})

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  actors: {
    visibilityService: visibilityLogic,
    getStoredUser: getStoredUserLogic,
    getSessionUser: getSessionUserLogic,
    logout: logoutLogic,
  },
  actions: {
    log: ({ context, event }) => {
      console.log("ctx", context)
      console.log("event", event)
    },
    assignInitialized: assign({
      initialized: () => true,
    }),
    resetInitialized: assign({
      initialized: () => false,
    }),
    setCurrentUser: assign(({ context, event }) => {
      if (event.type === "xstate.done.actor.getSessionUser") {
        return {
          currentUser: event.output.user,
          isNewUser: event.output.isNewUser,
        }
      }
      if (event.type === "INIT") {
        return {
          currentUser: event.data.user,
          isNewUser: event.data.isNewUser,
        }
      }
      return context
    }),
    setStoredUser: assign(({ context, event }) => {
      if (event.type === "xstate.done.actor.getStoredUser" && event.output.currentUser) {
        const storedUser = event.output.currentUser
        if (storedUser.userId) {
          return {
            currentUser: {
              userId: storedUser.userId,
              username: storedUser.username || undefined,
              isAdmin: storedUser.isAdmin,
            },
            isNewUser: false,
          }
        }
      }
      return context
    }),
    unsetNew: assign(() => ({
      isNewUser: false,
    })),
    setNew: assign(() => ({
      isNewUser: true,
    })),
    login: ({ context, event }) => {
      let userId: string | undefined = context.currentUser?.userId
      let username: string | undefined = context.currentUser?.username

      if (!userId && event.type === "xstate.done.actor.getStoredUser") {
        userId = event.output.currentUser?.userId || undefined
        username = event.output.currentUser?.username || undefined
      }

      const password = context.password
      emitToSocket("LOGIN", {
        fetchAllData: !context.initialized,
        userId,
        username,
        password: password,
        roomId: context.roomId,
      })
    },
    activateAdmin: assign({
      isAdmin: true,
      currentUser: ({ context }) =>
        context.currentUser ? { ...context.currentUser, isAdmin: true } : { userId: "" },
    }),
    disableRetry: assign({
      shouldRetry: () => false,
    }),
    changeUsername: ({ context }) => {
      if (context.currentUser) {
        emitToSocket("CHANGE_USERNAME", {
          userId: context.currentUser.userId,
          username: context.currentUser.username,
        })
      }
    },
    updateUsername: assign({
      currentUser: ({ context, event }) => {
        if (event.type !== "UPDATE_USERNAME") return context.currentUser
        return (
          context.currentUser && {
            ...context.currentUser,
            username: event.data,
          }
        )
      },
    }),
    saveUser: ({ context, event }) => {
      if (event.type === "INIT") {
        saveCurrentUser({
          currentUser: event.data.user,
        })
      }
    },
    saveUserOnUsername: ({ context, event }) => {
      if (event.type === "UPDATE_USERNAME" && context.currentUser) {
        saveCurrentUser({
          currentUser: { ...context.currentUser, username: event.data },
        })
      }
    },
    setPasswordError: assign({
      passwordError: ({ event }) => {
        if (event.type !== "SET_PASSWORD_ACCEPTED") return undefined
        if (event.data === undefined) return undefined
        return "Password incorrect"
      },
    }),
    setPasswordInContext: assign({
      password: ({ context, event }) => {
        if (event.type !== "SET_PASSWORD") return context.password
        return event.data
      },
    }),
    getStoredPassword: assign({
      password: () => getPassword(),
    }),
    disconnectUser: ({ context }) => {
      emitToSocket("USER_LEFT", {
        userId: context.currentUser?.userId,
        roomId: context.roomId,
      })
    },
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
    nukeUser: () => {
      emitToSocket("NUKE_USER", {})
    },
    kickUser: ({ event }) => {
      if (event.type !== "KICK_USER") return
      emitToSocket("KICK_USER", {
        userId: event.userId,
      })
    },
    checkPasswordRequirement: ({ context }) => {
      if (!context.password) return
      emitToSocket("CHECK_PASSWORD", context.password)
    },
    submitPassword: ({ context, event }) => {
      if (event.type !== "SET_PASSWORD") return
      emitToSocket("SUBMIT_PASSWORD", {
        password: event.data,
        roomId: context.roomId,
      })
    },
    setRoomId: assign({
      roomId: ({ context, event }) => {
        if (event.type !== "SETUP") return context.roomId
        return event.data.roomId
      },
    }),
    savePasswordAction: ({ event }) => {
      if (event.type === "SET_PASSWORD") {
        savePassword(event.data)
      }
    },
    logDisconnect: ({ event }) => {
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
    showReconnectingToast: ({ event }) => {
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
    showNukeSuccessToast: () => {
      toast({
        status: "success",
        title: "Spotify Disconnected",
        description:
          "Your Spotify account details and room data have been permanently deleted from our servers. Thanks for playing!",
      })
    },
    reloadPage: () => {
      window.location.reload()
    },
  },
  guards: {
    shouldRetry: ({ context }) => context.shouldRetry,
    shouldNotRetry: ({ context }) => !context.shouldRetry,
    isRoomAdmin: ({ event }) => {
      return event.type === "INIT" && !!event.data.user?.isAdmin
    },
    isAdmin: ({ context }) => {
      return !!context.currentUser?.isAdmin
    },
    requiresPassword: ({ event }) => {
      if (event.type !== "SET_PASSWORD_REQUIREMENT") return false
      return event.data.passwordRequired
    },
    hasStoredPasswordAndPasswordAccepted: ({ context, event }) => {
      if (event.type !== "SET_PASSWORD_REQUIREMENT") return false
      return (
        !event.data.passwordRequired ||
        (event.data.passwordRequired && !!context.password && event.data.passwordAccepted === true)
      )
    },
    passwordAccepted: ({ event }) => {
      if (event.type !== "SET_PASSWORD_ACCEPTED") return false
      return event.data.passwordAccepted
    },
    passwordRejected: ({ event }) => {
      if (event.type !== "SET_PASSWORD_ACCEPTED") return false
      return !event.data.passwordAccepted
    },
  },
}).createMachine({
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
      id: "visibilityService",
      src: "visibilityService",
    },
  ],
  on: {
    GET_SESSION_USER: ".fetching",
    LOGOUT: {
      target: ".loggingOut",
      actions: ["clearSession"],
    },
    SETUP: {
      target: ".retrieving",
      actions: ["setRoomId"],
    },
  },
  states: {
    idle: {},
    fetching: {
      invoke: {
        id: "getSessionUser",
        src: "getSessionUser",
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
          { target: "connecting", guard: "hasStoredPasswordAndPasswordAccepted" },
          { target: "unauthorized", guard: "requiresPassword" },
          { target: "connecting" },
        ],
      },
    },
    disconnected: {
      entry: ["showDisconnectedToast", "resetInitialized"],
      on: {
        SETUP: {
          target: "retrieving",
          actions: ["setRoomId"],
        },
        SOCKET_RECONNECTED: {
          target: "retrieving",
          actions: ["showReconnectedToast"],
        },
        SOCKET_CONNECTED: {
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
        src: "getStoredUser",
        onDone: {
          target: "connecting",
          actions: ["setStoredUser"],
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
            guard: "isRoomAdmin",
          },
          {
            target: "authenticated",
            actions: ["setCurrentUser", "saveUser", "assignInitialized"],
          },
        ],
        UNAUTHORIZED: {
          target: "unauthorized",
        },
        // Retry login immediately when socket connects (in case initial attempt failed)
        SOCKET_CONNECTED: {
          target: "connecting",
          reenter: true,
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
          // Intentional navigation away - go to idle without showing toast
          target: "idle",
          actions: ["disconnectUser"],
        },
        SOCKET_DISCONNECTED: {
          target: "disconnected",
          actions: ["logDisconnect"],
        },
        UPDATE_USERNAME: {
          actions: ["unsetNew", "updateUsername", "changeUsername", "saveUserOnUsername"],
        },
        ACTIVATE_ADMIN: {
          actions: ["activateAdmin"],
        },
        KICK_USER: {
          actions: ["kickUser"],
          guard: "isAdmin",
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
          actions: ["clearSession", "nukeUser", "showNukeSuccessToast"],
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
          actions: ["setPasswordInContext", "savePasswordAction", "submitPassword"],
        },
        SET_PASSWORD_ACCEPTED: [
          { actions: ["setPasswordError"], guard: "passwordRejected" },
          {
            actions: ["setPasswordError", "setNew"],
            target: "connecting",
            guard: "passwordAccepted",
          },
        ],
      },
    },
    loggingOut: {
      invoke: {
        id: "logout",
        src: "logout",
        onDone: {
          target: "idle",
          actions: ["clearSession", "reloadPage"],
        },
      },
    },
  },
})
