import { assign, setup } from "xstate"
import type { MetadataSourceTrackWithSource } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"

/** SERVER_EVENT allowlist for `useSocketMachine` (ADR 0093). */
export const MEDIA_ITEM_TRACKS_EVENT_TYPES = [
  "LIST_MEDIA_ITEM_TRACKS_RESULTS",
  "LIST_MEDIA_ITEM_TRACKS_FAILURE",
]

export interface MediaItemTracksContext {
  mediaKey: string | null
  name: string | null
  tracks: MetadataSourceTrackWithSource[]
  error: string | null
}

type MediaItemTracksEvent =
  | { type: "FETCH"; mediaKey: string }
  | { type: "RESET" }
  | {
      type: "LIST_MEDIA_ITEM_TRACKS_RESULTS"
      data?: { mediaKey?: string; name?: string; tracks?: MetadataSourceTrackWithSource[] }
    }
  | { type: "LIST_MEDIA_ITEM_TRACKS_FAILURE"; data?: { message?: string } }

const defaultContext: MediaItemTracksContext = {
  mediaKey: null,
  name: null,
  tracks: [],
  error: null,
}

/**
 * Track list for one Physical Media item (`LIST_MEDIA_ITEM_TRACKS`, ADR 0103/0104).
 * Component-local: pair with `useSocketMachine` and the allowlist above.
 */
export const mediaItemTracksMachine = setup({
  types: {
    context: {} as MediaItemTracksContext,
    events: {} as MediaItemTracksEvent,
  },
  actions: {
    startRequest: assign(({ event }) =>
      event.type === "FETCH"
        ? { mediaKey: event.mediaKey, name: null, tracks: [], error: null }
        : {},
    ),
    sendListTracks: ({ context }) => {
      if (context.mediaKey) {
        emitToSocket("LIST_MEDIA_ITEM_TRACKS", { mediaKey: context.mediaKey })
      }
    },
    setTracks: assign(({ event }) => {
      if (event.type !== "LIST_MEDIA_ITEM_TRACKS_RESULTS") return {}
      return {
        name: event.data?.name ?? null,
        tracks: event.data?.tracks ?? [],
        error: null,
      }
    }),
    setError: assign(({ event }) => {
      if (event.type !== "LIST_MEDIA_ITEM_TRACKS_FAILURE") return {}
      return { tracks: [], error: event.data?.message ?? "Failed to load tracks" }
    }),
    resetContext: assign(() => defaultContext),
  },
  guards: {
    /** Ignore a late payload for an item the viewer already navigated away from. */
    isCurrentMediaKey: ({ context, event }) => {
      if (event.type !== "LIST_MEDIA_ITEM_TRACKS_RESULTS") return false
      const incoming = event.data?.mediaKey
      return incoming == null || incoming === context.mediaKey
    },
  },
}).createMachine({
  id: "mediaItemTracks",
  initial: "idle",
  context: defaultContext,
  on: {
    FETCH: {
      target: ".loading",
      actions: ["startRequest"],
    },
    RESET: {
      target: ".idle",
      actions: ["resetContext"],
    },
  },
  states: {
    idle: {},
    loaded: {},
    failure: {},
    loading: {
      entry: ["sendListTracks"],
      on: {
        LIST_MEDIA_ITEM_TRACKS_RESULTS: {
          target: "loaded",
          guard: "isCurrentMediaKey",
          actions: ["setTracks"],
        },
        LIST_MEDIA_ITEM_TRACKS_FAILURE: {
          target: "failure",
          actions: ["setError"],
        },
      },
    },
  },
})
