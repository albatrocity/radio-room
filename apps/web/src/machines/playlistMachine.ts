import { assign, createMachine } from "xstate"
import { uniqBy } from "lodash/fp"
import socketService from "../lib/socketService"
import { PlaylistItem } from "../types/PlaylistItem"

interface Context {
  playlist: PlaylistItem[]
}

export const playlistMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "playlist",
    context: {
      playlist: [],
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
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
          return uniqBy("timestamp", [...ctx.playlist, ...event.data.playlist])
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
    },
  },
)
