import { assign, setup } from "xstate"
import type { MetadataBrowseAlbum, MetadataBrowseArtist, MetadataSourceTrack } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

type RequestError = {
  message: string
  error?: any
}

export type SearchBrowseArtist = MetadataBrowseArtist & { source?: string }
export type SearchBrowseAlbum = MetadataBrowseAlbum & { source?: string }

export type SearchAuthError = {
  source: string
  status: number
  message: string
}

export interface TrackSearchContext {
  results: MetadataSourceTrack[]
  artists: SearchBrowseArtist[]
  albums: SearchBrowseAlbum[]
  authErrors: SearchAuthError[]
  error: RequestError | null
  total: number
  offset: number
  nextUrl: string | undefined
  prevUrl: string | undefined
  limit: number
}

/** SERVER_EVENT allowlist for `useSocketMachine` (ADR 0093) — keep in sync with `TrackSearchEvent`. */
export const TRACK_SEARCH_EVENT_TYPES = ["TRACK_SEARCH_RESULTS", "TRACK_SEARCH_RESULTS_FAILURE"]

type TrackSearchEvent =
  | { type: "FETCH_RESULTS"; value: string }
  | {
      type: "TRACK_SEARCH_RESULTS"
      data: {
        items: MetadataSourceTrack[]
        artists?: SearchBrowseArtist[]
        albums?: SearchBrowseAlbum[]
        authErrors?: SearchAuthError[]
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
        artists: event.data.artists || [],
        albums: event.data.albums || [],
        authErrors: event.data.authErrors || [],
        total: event.data.total || 0,
        offset: event.data.offset || 0,
        nextUrl: event.data.next,
        prevUrl: event.data.previous,
        limit: event.data.limit || 0,
        error: null,
      }
    }),
    setError: assign(({ event }) => {
      if (event.type !== "TRACK_SEARCH_RESULTS_FAILURE") return {}
      return {
        error: event.data,
        authErrors: [],
      }
    }),
  },
}).createMachine({
  id: "track-search",
  initial: "idle",
  context: {
    results: [],
    artists: [],
    albums: [],
    authErrors: [],
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
