import { assign, sendTo, createMachine, AnyEventObject } from "xstate"
import socketService from "../lib/socketService"
import { search } from "../lib/spotify/spotifyApi"
import { MetadataSourceTrack } from "@repo/types"

type RequestError = {
  message: string
  error?: any
}

export interface TrackSearchContext {
  results: MetadataSourceTrack[]
  error: RequestError | null
  total: number
  offset: number
  nextUrl: string | undefined
  prevUrl: string | undefined
  limit: number
  accessToken?: string
}

type TrackSearchEvent =
  | {
      type: "FETCH_RESULTS"
      value: string
    }
  | AnyEventObject

async function searchTracks(ctx: TrackSearchContext, event: TrackSearchEvent) {
  if (!ctx.accessToken) {
    throw new Error("No access token found")
  }

  const results = await search({
    query: event.value,
    accessToken: ctx.accessToken,
  })
  if (results) {
    return results.tracks
  }
  return {}
}

export const trackSearchMachine = createMachine<TrackSearchContext>(
  {
    predictableActionArguments: true,
    id: "track-search",
    initial: "idle",
    context: {
      results: [],
      error: null,
      total: 0,
      offset: 0,
      nextUrl: undefined,
      prevUrl: undefined,
      limit: 20,
      accessToken: undefined,
    },
    states: {
      idle: {
        id: "idle",
        on: {
          FETCH_RESULTS: [
            {
              target: "loading.server",
              cond: "isUnauthenticated",
            },
            {
              target: "loading.client",
              cond: "isAuthenticated",
            },
          ],
        },
      },
      failure: {
        id: "failure",
        on: {
          FETCH_RESULTS: "loading",
        },
      },
      loading: {
        states: {
          client: {
            invoke: {
              id: "search",
              src: searchTracks,
              onDone: {
                target: "#idle",
                actions: ["setResults"],
              },
              onError: {
                target: "#failure",
                actions: ["setError"],
              },
            },
          },
          server: {
            entry: ["sendQuery"],
            on: {
              TRACK_SEARCH_RESULTS: {
                target: "#idle",
                actions: ["setResults"],
              },
              TRACK_SEARCH_RESULTS_FAILURE: {
                target: "#failure",
                actions: ["setError"],
              },
            },
          },
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
      sendQuery: sendTo("socket", (_ctx, event) => {
        return {
          type: "search spotify track",
          data: { query: event.value, options: {} },
        }
      }),
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
    guards: {
      isAuthenticated: (ctx) => {
        return !!ctx.accessToken
      },
      isUnauthenticated: (ctx) => {
        return !ctx.accessToken
      },
    },
  },
)

