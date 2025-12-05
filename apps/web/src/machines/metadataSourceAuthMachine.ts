// Service-agnostic state machine for checking if the room's metadata source is authenticated
import { setup, assign } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"

interface Context {
  userId?: string
  serviceName?: string
  accessToken?: string
}

type MetadataSourceAuthEvent =
  | { type: "FETCH_STATUS" }
  | { type: "INIT"; data: { userId?: string; serviceName?: string } }
  | { type: "SERVICE_ACCESS_TOKEN_REFRESHED"; data: { accessToken?: string } }
  | { type: "SERVICE_AUTHENTICATION_STATUS"; data: { isAuthenticated: boolean; accessToken?: string } }
  | { type: "LOGOUT" }

export const metadataSourceAuthMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MetadataSourceAuthEvent,
  },
  actions: {
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
  initial: "loading",
  context: {},
  on: {
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
})
