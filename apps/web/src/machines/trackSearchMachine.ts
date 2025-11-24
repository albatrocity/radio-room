import { assign, sendTo, createMachine, AnyEventObject } from "xstate"
import socketService from "../lib/socketService"
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
}

type TrackSearchEvent =
  | {
      type: "FETCH_RESULTS"
      value: string
    }
  | AnyEventObject

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
    },
    states: {
      idle: {
        id: "idle",
        on: {
          FETCH_RESULTS: {
            target: "loading",
          },
        },
      },
      failure: {
        id: "failure",
        on: {
          FETCH_RESULTS: "loading",
        },
      },
      loading: {
        entry: ["sendQuery"],
        on: {
          TRACK_SEARCH_RESULTS: {
            target: "idle",
            actions: ["setResults"],
          },
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
        src: (() => socketService) as any,
      },
    ],
  },
  {
    actions: {
      sendQuery: sendTo("socket", (_ctx, event) => {
        return {
          type: "search track",
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
  },
)
