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
    on: {
      INIT: {
        actions: ["setData"],
      },
      PLAYLIST: {
        actions: ["setPlaylist"],
      },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
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
        playlist: (context, event) => {
          return event.data.playlist
        },
      }),
      setPlaylist: assign({
        playlist: (context, event) => {
          return event.data
        },
      }),
    },
  },
)
