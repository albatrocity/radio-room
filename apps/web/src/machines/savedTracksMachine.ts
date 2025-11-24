import { assign, createMachine, sendTo } from "xstate"
import { MetadataSourceTrack } from "@repo/types"
import socketService from "../lib/socketService"

type RequestError = {
  message: string
  error?: any
}

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

export const savedTracksMachine = createMachine<SavedTracksContext, SavedTracksEvent>(
  {
    predictableActionArguments: true,
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
    invoke: [
      {
        id: "socket",
        src: (() => socketService) as any,
      },
    ],
  },
  {
    actions: {
      fetchSavedTracks: sendTo("socket", () => ({
        type: "get saved tracks",
      })),
      setResults: assign((_context, event) => {
        if (event.type !== "SAVED_TRACKS_RESULTS") return {}
        // Server returns already-transformed MetadataSourceTrack[]
        return {
          savedTracks: event.data || [],
        }
      }),
      setError: assign((_ctx, event) => {
        if (event.type !== "SAVED_TRACKS_RESULTS_FAILURE") return {}
        return {
          error: event.error || "Failed to fetch saved tracks",
        }
      }),
    },
  },
)
