import { assign, setup } from "xstate"
import { uniqBy } from "lodash/fp"
import { QueueItem } from "../types/Queue"

interface Context {
  playlist: QueueItem[]
}

type PlaylistEvent =
  | { type: "INIT"; data: { playlist: QueueItem[] } }
  | { type: "PLAYLIST"; data: QueueItem[] }
  | { type: "PLAYLIST_TRACK_ADDED"; data: { track: QueueItem } }
  | { type: "PLAYLIST_TRACK_UPDATED"; data: { track: QueueItem } }
  | { type: "ROOM_DATA"; data: { playlist: QueueItem[] } }
  | { type: "TOGGLE_PLAYLIST" }

export const playlistMachine = setup({
  types: {
    context: {} as Context,
    events: {} as PlaylistEvent,
  },
  actions: {
    setData: assign({
      playlist: ({ event }) => {
        if (event.type === "INIT") {
          return event.data.playlist
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
    addTracksToPlaylist: assign({
      playlist: ({ context, event }) => {
        if (event.type !== "ROOM_DATA") {
          return context.playlist
        }
        // Use track.id as unique key since QueueItem doesn't have timestamp
        return uniqBy(
          (item: QueueItem) => item.track.id,
          [...context.playlist, ...event.data.playlist],
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
  context: {
    playlist: [],
  },
  on: {
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
  initial: "inactive",
  states: {
    active: {
      on: {
        TOGGLE_PLAYLIST: "inactive",
      },
    },
    inactive: {
      on: {
        TOGGLE_PLAYLIST: "active",
      },
    },
  },
})
