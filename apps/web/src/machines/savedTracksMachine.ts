// state machine for fetching saved tracks

import { assign, createMachine } from "xstate"
import { savedTracks } from "../lib/spotify/spotifyApi"
import { SpotifyTrack } from "../types/SpotifyTrack"

export interface SavedTracksContext {
  savedTracks: SpotifyTrack[]
  accessToken?: string
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

async function fetchSavedTracks(ctx: SavedTracksContext) {
  if (ctx.accessToken) {
    const results = await savedTracks({ accessToken: ctx.accessToken })
    return results
  }
  throw new Error("No access token found")
}

export type SavedTracksEvent =
  | {
      type: "done.invoke.fetchSavedTracks"
      data: SavedTracksResponse
      error?: null
    }
  | { type: "SAVED_TRACKS_RESULTS_FAILURE"; data: {}; error?: string }

export const savedTracksMachine = createMachine<
  SavedTracksContext,
  SavedTracksEvent
>(
  {
    id: "savedTracks",
    initial: "initial",
    context: {
      accessToken: undefined,
      savedTracks: [],
      error: "",
    },
    states: {
      initial: {
        always: [{ target: "loading", cond: "hasAccessToken" }],
      },
      loading: {
        invoke: {
          id: "fetchSavedTracks",
          src: fetchSavedTracks,
          onDone: {
            target: "success",
            actions: ["setSavedTracks"],
          },
          onError: {
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
      setError: assign((ctx, event) => {
        if (event.type === "done.invoke.fetchSavedTracks") return ctx
        return {
          error: event.error,
        }
      }),
      setSavedTracks: assign((ctx, event) => {
        if (event.type !== "done.invoke.fetchSavedTracks") return ctx
        return {
          savedTracks: event.data.items.map((item) => item.track),
        }
      }),
    },
    guards: {
      hasAccessToken: (ctx) => {
        return !!ctx.accessToken
      },
    },
  },
)
