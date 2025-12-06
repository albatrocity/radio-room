// Service-agnostic state machine for checking if the room's metadata source is authenticated
import { setup, assign } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface MetadataSourceAuthContext {
  userId?: string
  serviceName?: string
  accessToken?: string
  subscriptionId: string | null
}

type MetadataSourceAuthEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "FETCH_STATUS" }
  | { type: "INIT"; data: { userId?: string; serviceName?: string } }
  | { type: "SERVICE_ACCESS_TOKEN_REFRESHED"; data: { accessToken?: string } }
  | { type: "SERVICE_AUTHENTICATION_STATUS"; data: { isAuthenticated: boolean; accessToken?: string } }
  | { type: "LOGOUT" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: MetadataSourceAuthContext = {
  subscriptionId: null,
}

export const metadataSourceAuthMachine = setup({
  types: {
    context: {} as MetadataSourceAuthContext,
    events: {} as MetadataSourceAuthEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `metadataSourceAuth-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    assignContext: assign(({ context, event }) => {
      if (event.type !== "INIT") return context
      return {
        userId: event.data?.userId ?? context.userId,
        serviceName: event.data?.serviceName ?? context.serviceName,
      }
    }),
    fetchAuthenticationStatus: ({ context }) => {
      emitToSocket("GET_USER_SERVICE_AUTHENTICATION_STATUS", {
        userId: context.userId,
        serviceName: context.serviceName || "spotify", // Default to spotify for backward compat
      })
    },
    logout: ({ context }) => {
      emitToSocket("LOGOUT_SERVICE", {
        serviceName: context.serviceName || "spotify",
      })
    },
    notifyLogout: ({ context }) => {
      const serviceName = context.serviceName || "service"
      toast({
        title: `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} Disconnected`,
        description: `Your ${serviceName} account is now unlinked`,
        status: "success",
      })
    },
    resetContext: assign(() => defaultContext),
  },
  guards: {
    isAuthenticated: ({ event }) => {
      if (event.type === "SERVICE_AUTHENTICATION_STATUS") {
        return event.data.isAuthenticated
      }
      return false
    },
    isUnauthenticated: ({ event }) => {
      if (event.type === "SERVICE_AUTHENTICATION_STATUS") {
        return !event.data.isAuthenticated
      }
      return false
    },
    hasAccessToken: ({ event }) => {
      if (event.type === "SERVICE_ACCESS_TOKEN_REFRESHED") {
        return !!event.data.accessToken
      }
      return false
    },
  },
}).createMachine({
  id: "metadata-source-auth",
  initial: "idle",
  context: defaultContext,
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetContext"],
        },
        FETCH_STATUS: {
          target: ".loading",
        },
        INIT: {
          actions: ["assignContext"],
        },
        SERVICE_ACCESS_TOKEN_REFRESHED: {
          target: ".authenticated",
          guard: "hasAccessToken",
        },
      },
      initial: "loading",
      states: {
        unauthenticated: {},
        authenticated: {
          on: {
            LOGOUT: {
              target: "unauthenticated",
              actions: ["logout", "notifyLogout"],
            },
          },
        },
        loading: {
          entry: ["fetchAuthenticationStatus"],
          on: {
            SERVICE_AUTHENTICATION_STATUS: [
              {
                target: "authenticated",
                guard: "isAuthenticated",
              },
              {
                target: "unauthenticated",
                guard: "isUnauthenticated",
              },
            ],
          },
        },
      },
    },
  },
})
