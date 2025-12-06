import { assign, setup } from "xstate"
import { uniqBy } from "lodash/fp"
import { QueueItem } from "../types/Queue"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface PlaylistContext {
  playlist: QueueItem[]
  subscriptionId: string | null
}

type PlaylistEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "INIT"; data: { playlist: QueueItem[] } }
  | { type: "PLAYLIST"; data: QueueItem[] }
  | { type: "PLAYLIST_TRACK_ADDED"; data: { track: QueueItem } }
  | { type: "PLAYLIST_TRACK_UPDATED"; data: { track: QueueItem } }
  | { type: "ROOM_DATA"; data: { playlist: QueueItem[] } }
  | { type: "TOGGLE_PLAYLIST" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const playlistMachine = setup({
  types: {
    context: {} as PlaylistContext,
    events: {} as PlaylistEvent,
  },
  actions: {
    subscribe: assign(({ context, self }) => {
      const id = `playlist-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as PlaylistEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setData: assign({
      playlist: ({ event }) => {
        if (event.type === "INIT") {
          return event.data.playlist || []
        }
        return []
      },
    }),
    setPlaylist: assign({
      playlist: ({ event }) => {
        if (event.type === "PLAYLIST") {
          return event.data
        }
        return []
      },
    }),
    resetPlaylist: assign({
      playlist: () => [],
      subscriptionId: () => null,
    }),
    addTracksToPlaylist: assign({
      playlist: ({ context, event }) => {
        if (event.type !== "ROOM_DATA") {
          return context.playlist
        }
        // Use track.id as unique key since QueueItem doesn't have timestamp
        return uniqBy(
          (item: QueueItem) => item.track.id,
          [...context.playlist, ...(event.data.playlist || [])],
        )
      },
    }),
    addToPlaylist: assign({
      playlist: ({ context, event }) => {
        if (event.type !== "PLAYLIST_TRACK_ADDED") {
          return context.playlist
        }
        return [...context.playlist, event.data.track]
      },
    }),
    updateTrackInPlaylist: assign({
      playlist: ({ context, event }) => {
        if (event.type !== "PLAYLIST_TRACK_UPDATED") {
          return context.playlist
        }
        const updatedTrack = event.data.track
        // Find and update the track by mediaSource.trackId
        return context.playlist.map((item) =>
          item.mediaSource.trackId === updatedTrack.mediaSource.trackId ? updatedTrack : item,
        )
      },
    }),
  },
}).createMachine({
  id: "playlist",
  initial: "idle",
  context: {
    playlist: [],
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetPlaylist"],
        },
        INIT: {
          actions: ["setData"],
        },
        PLAYLIST: {
          actions: ["setPlaylist"],
        },
        PLAYLIST_TRACK_ADDED: {
          actions: ["addToPlaylist"],
        },
        PLAYLIST_TRACK_UPDATED: {
          actions: ["updateTrackInPlaylist"],
        },
        ROOM_DATA: {
          actions: ["addTracksToPlaylist"],
        },
      },
      initial: "collapsed",
      states: {
        expanded: {
          on: {
            TOGGLE_PLAYLIST: "collapsed",
          },
        },
        collapsed: {
          on: {
            TOGGLE_PLAYLIST: "expanded",
          },
        },
      },
    },
  },
})
