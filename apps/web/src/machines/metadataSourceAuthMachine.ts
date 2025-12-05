// Service-agnostic state machine for checking if the room's metadata source is authenticated
import { createMachine, assign } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"

interface Context {
  userId?: string
  serviceName?: string
  accessToken?: string
}

export const metadataSourceAuthMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "metadata-source-auth",
    initial: "loading",
    context: {},
    on: {
      FETCH_STATUS: {
        target: "loading",
      },
      INIT: {
        actions: ["assignContext"],
      },
      SERVICE_ACCESS_TOKEN_REFRESHED: {
        target: "authenticated",
        cond: "hasAccessToken",
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
              cond: "isAuthenticated",
            },
            {
              target: "unauthenticated",
              cond: "isUnauthenticated",
            },
          ],
        },
      },
    },
  },
  {
    actions: {
      assignContext: assign({
        userId: (ctx, event) => {
          return event.data?.userId ?? ctx.userId
        },
        serviceName: (ctx, event) => {
          return event.data?.serviceName ?? ctx.serviceName
        },
      }),
      fetchAuthenticationStatus: (ctx) => {
        emitToSocket("GET_USER_SERVICE_AUTHENTICATION_STATUS", {
          userId: ctx.userId,
          serviceName: ctx.serviceName || "spotify", // Default to spotify for backward compat
        })
      },
      logout: (ctx) => {
        emitToSocket("LOGOUT_SERVICE", {
          serviceName: ctx.serviceName || "spotify",
        })
      },
      notifyLogout: (ctx) => {
        const serviceName = ctx.serviceName || "service"
        toast({
          title: `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} Disconnected`,
          description: `Your ${serviceName} account is now unlinked`,
          status: "success",
        })
      },
    },
    guards: {
      isAuthenticated: (_context, event) => {
        return event.data.isAuthenticated
      },
      isUnauthenticated: (_context, event) => {
        return !event.data.isAuthenticated
      },
      hasAccessToken: (_context, event) => {
        return !!event.data.accessToken
      },
    },
  },
)
