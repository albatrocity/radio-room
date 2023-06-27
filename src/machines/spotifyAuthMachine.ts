// state machine for fetching the current user's spotify authentication status
import { sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"

interface Context {}

export const spotifyAuthMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "spotify-search",
    initial: "loading",
    context: {},
    on: {
      FETCH_STATUS: {
        target: "loading",
      },
    },
    states: {
      unauthenticated: {},
      authenticated: {},
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
      fetchAuthenticationStatus: sendTo("socket", () => {
        return {
          type: "get user spotify authentication status",
        }
      }),
    },
    guards: {
      isAuthenticated: (_context, event) => {
        return event.data.isAuthenticated
      },
      isUnauthenticated: (_context, event) => {
        return !event.data.isAuthenticated
      },
    },
  },
)
