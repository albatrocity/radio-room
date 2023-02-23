import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { SpotifyTrack } from "../types/SpotifyTrack"

type RequestError = {
  message: string
  error?: any
}

interface Context {
  results: SpotifyTrack[]
  error: RequestError | null
  total: number
  offset: number
  nextUrl: string | undefined
  prevUrl: string | undefined
  limit: number
}

export const spotifySearchMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "spotify-search",
    initial: "idle",
    context: {
      results: [],
      error: null,
      total: 0,
      offset: 0,
      nextUrl: undefined,
      prevUrl: undefined,
      limit: 20,
    },
    states: {
      idle: {
        on: {
          FETCH_RESULTS: "loading",
        },
      },
      failure: {
        on: {
          FETCH_RESULTS: "loading",
        },
      },
      loading: {
        entry: ["sendQuery"],
        on: {
          TRACK_SEARCH_RESULTS: { target: "idle", actions: ["setResults"] },
          TRACK_SEARCH_RESULTS_FAILURE: {
            target: "failure",
            actions: ["setError"],
          },
        },
      },
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
  },
  {
    actions: {
      sendQuery: send(
        (_ctx, event) => {
          return {
            type: "search spotify track",
            data: { query: event.value, options: {} },
          }
        },
        {
          to: "socket",
        },
      ),
      setResults: assign((_context, event) => {
        return {
          results: event.data.items || [],
          total: event.data.total || 0,
          offset: event.data.offset || 0,
          nextUrl: event.data.next,
          prevUrl: event.data.previous,
          limit: event.data.limit || 0,
        }
      }),
      setError: assign((_context, event) => ({
        error: event.data,
      })),
    },
  },
)
