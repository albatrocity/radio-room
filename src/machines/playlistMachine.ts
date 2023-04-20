import { assign, createMachine } from "xstate"
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
    },
  },
)
