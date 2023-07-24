// state machine for fetching the current user's spotify authentication status
import { sendTo, createMachine, assign } from "xstate"
import socketService from "../lib/socketService"
import { toast } from "../lib/toasts"

interface Context {
  userId?: string
  accessToken?: string
}

export const spotifyAuthMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "spotify-auth",
    initial: "loading",
    context: {},
    on: {
      FETCH_STATUS: {
        target: "loading",
      },
      INIT: {
        actions: ["assignUserId"],
      },
      SPOTIFY_ACCESS_TOKEN_REFRESHED: {
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
          SPOTIFY_AUTHENTICATION_STATUS: [
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
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
  },
  {
    actions: {
      assignUserId: assign({
        userId: (ctx, event) => {
          return event.data.user.userId ?? ctx.userId
        },
      }),
      fetchAuthenticationStatus: sendTo("socket", (ctx) => {
        return {
          type: "get user spotify authentication status",
          data: {
            userId: ctx.userId,
          },
        }
      }),
      logout: sendTo("socket", "logout spotify"),
      notifyLogout: () => {
        toast({
          title: "Spotify Disconnected",
          description: "Your Spotify account is now unlinked",
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
