import { assign, setup } from "xstate"
import { MetadataSourceTrack } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

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
  | { type: "FETCH_RESULTS"; value: string }
  | {
      type: "TRACK_SEARCH_RESULTS"
      data: {
        items: MetadataSourceTrack[]
        total: number
        offset: number
        next?: string
        previous?: string
        limit: number
      }
    }
  | { type: "TRACK_SEARCH_RESULTS_FAILURE"; data: RequestError }

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
export const trackSearchMachine = setup({
  types: {
    context: {} as TrackSearchContext,
    events: {} as TrackSearchEvent,
  },
  actions: {
    sendQuery: ({ event }) => {
      if (event.type === "FETCH_RESULTS") {
        emitToSocket("SEARCH_TRACK", { query: event.value, options: {} })
      }
    },
    setResults: assign(({ event }) => {
      if (event.type !== "TRACK_SEARCH_RESULTS") return {}
      return {
        results: event.data.items || [],
        total: event.data.total || 0,
        offset: event.data.offset || 0,
        nextUrl: event.data.next,
        prevUrl: event.data.previous,
        limit: event.data.limit || 0,
      }
    }),
    setError: assign(({ event }) => {
      if (event.type !== "TRACK_SEARCH_RESULTS_FAILURE") return {}
      return {
        error: event.data,
      }
    }),
  },
}).createMachine({
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
})
