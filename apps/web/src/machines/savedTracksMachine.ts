import { assign, setup } from "xstate"
import { MetadataSourceTrack } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

export interface SavedTracksContext {
  savedTracks: MetadataSourceTrack[]
  error: string
}

export type SavedTracksEvent =
  | {
      type: "SAVED_TRACKS_RESULTS"
      data: MetadataSourceTrack[]
    }
  | {
      type: "SAVED_TRACKS_RESULTS_FAILURE"
      error?: string
    }

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
export const savedTracksMachine = setup({
  types: {
    context: {} as SavedTracksContext,
    events: {} as SavedTracksEvent,
  },
  actions: {
    fetchSavedTracks: () => {
      emitToSocket("GET_SAVED_TRACKS", {})
    },
    setResults: assign(({ event }) => {
      if (event.type !== "SAVED_TRACKS_RESULTS") return {}
      return {
        savedTracks: event.data || [],
      }
    }),
    setError: assign(({ event }) => {
      if (event.type !== "SAVED_TRACKS_RESULTS_FAILURE") return {}
      return {
        error: event.error || "Failed to fetch saved tracks",
      }
    }),
  },
}).createMachine({
  id: "saved-tracks",
  initial: "loading",
  context: {
    savedTracks: [],
    error: "",
  },
  states: {
    loading: {
      entry: ["fetchSavedTracks"],
      on: {
        SAVED_TRACKS_RESULTS: {
          target: "success",
          actions: ["setResults"],
        },
        SAVED_TRACKS_RESULTS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
    success: {
      id: "success",
    },
    failure: {
      id: "failure",
    },
  },
})
