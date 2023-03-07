import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { SpotifyPlaylist } from "../types/SpotifyPlaylist"

interface Context {
  playlistMeta: SpotifyPlaylist | null
  playlistError: any
}

export const savePlaylistMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "save-playlist",
    context: {
      playlistMeta: null,
      playlistError: null,
    },
    initial: "idle",
    states: {
      idle: {
        on: {
          ADMIN_SAVE_PLAYLIST: {
            target: "loading",
            actions: ["savePlaylist"],
          },
        },
      },
      loading: {
        on: {
          PLAYLIST_SAVED: {
            target: "success",
            actions: ["setPlaylistMeta"],
          },
          SAVE_PLAYLIST_FAILED: {
            target: "error",
            actions: ["setPlaylistError"],
          },
        },
      },
      success: {
        after: {
          1000: "idle",
        },
      },
      error: {
        after: {
          1000: "idle",
        },
      },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
  },
  {
    actions: {
      savePlaylist: send(
        (_ctx, event) => {
          return {
            type: "save playlist",
            data: { name: event.name, uris: event.uris },
          }
        },
        {
          to: "socket",
        },
      ),
      setPlaylistMeta: assign({
        playlistMeta: (context, event) => {
          return event.data
        },
      }),
      setPlaylistError: assign({
        playlistError: (context, event) => {
          return event.error
        },
      }),
    },
  },
)
