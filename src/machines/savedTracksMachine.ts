// state machine for fetching saved tracks

import { assign, createMachine } from "xstate"
import { sendTo } from "xstate/lib/actions"
import socketService from "../lib/socketService"
import { SpotifyTrack } from "../types/SpotifyTrack"

export interface SavedTracksContext {
  savedTracks: SpotifyTrack[]
  error: string
}

type SavedTracksItem = {
  added_at: string
  track: SpotifyTrack
}

type SavedTracksResponse = {
  items: SavedTracksItem[]
  limit: number
  next: string
  offset: number
  previous: string
  total: number
}

export type SavedTracksEvent =
  | { type: "SAVED_TRACKS_RESULTS"; data: SavedTracksResponse; error?: null }
  | { type: "SAVED_TRACKS_RESULTS_FAILURE"; data: {}; error?: string }

export const savedTracksMachine = createMachine<
  SavedTracksContext,
  SavedTracksEvent
>(
  {
    id: "savedTracks",
    initial: "loading",
    context: {
      savedTracks: [],
      error: "",
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    states: {
      loading: {
        entry: ["fetchSavedTracks"],
        on: {
          SAVED_TRACKS_RESULTS: {
            target: "success",
            actions: ["setSavedTracks"],
          },
          SAVED_TRACKS_RESULTS_FAILURE: {
            target: "error",
            actions: ["setError"],
          },
        },
      },
      success: {},
      error: {},
    },
  },
  {
    actions: {
      fetchSavedTracks: sendTo("socket", () => {
        return {
          type: "get spotify saved tracks",
        }
      }),
      setError: assign((ctx, event) => {
        if (event.type === "SAVED_TRACKS_RESULTS") return ctx
        return {
          error: event.error,
        }
      }),
      setSavedTracks: assign((ctx, event) => {
        if (event.type === "SAVED_TRACKS_RESULTS_FAILURE") return ctx
        return {
          savedTracks: event.data.items.map((item) => item.track),
        }
      }),
    },
  },
)
