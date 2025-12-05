import { assign, createMachine } from "xstate"
import { uniqBy } from "lodash/fp"
import { QueueItem } from "../types/Queue"

interface Context {
  playlist: QueueItem[]
}

export const playlistMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
  },
  {
    actions: {
      setData: assign({
        playlist: (_ctx, event) => {
          return event.data.playlist
        },
      }),
      setPlaylist: assign({
        playlist: (_ctx, event) => {
          return event.data
        },
      }),
      addTracksToPlaylist: assign({
        playlist: (ctx, event) => {
          if (event.type !== "ROOM_DATA") {
            return ctx.playlist
          }
          // Use track.id as unique key since QueueItem doesn't have timestamp
          return uniqBy(
            (item: QueueItem) => item.track.id,
            [...ctx.playlist, ...event.data.playlist],
          )
        },
      }),
      addToPlaylist: assign({
        playlist: (ctx, event) => {
          if (event.type !== "PLAYLIST_TRACK_ADDED") {
            return ctx.playlist
          }
          return [...ctx.playlist, event.data.track]
        },
      }),
      updateTrackInPlaylist: assign({
        playlist: (ctx, event) => {
          if (event.type !== "PLAYLIST_TRACK_UPDATED") {
            return ctx.playlist
          }
          const updatedTrack = event.data.track
          // Find and update the track by mediaSource.trackId
          return ctx.playlist.map((item) =>
            item.mediaSource.trackId === updatedTrack.mediaSource.trackId ? updatedTrack : item,
          )
        },
      }),
    },
  },
)
