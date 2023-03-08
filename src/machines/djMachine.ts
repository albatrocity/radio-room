import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { SpotifyPlaylist } from "../types/SpotifyPlaylist"

interface Context {
  playlistMeta: SpotifyPlaylist | null
  playlistError: any
}

export const djMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "dj",
    context: {
      playlistMeta: null,
      playlistError: null,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    initial: "listening",
    on: {
      INIT: [
        {
          target: "deputyDjaying",
          actions: ["setData"],
          cond: "isDeputyDj",
        },
      ],
    },
    states: {
      djaying: {},
      deputyDjaying: {},
      listening: {},
    },
  },
  {
    guards: {
      isDeputyDj: (ctx, event) => {
        return event.data?.currentUser?.isDeputyDj
      },
    },
    actions: {},
  },
)
