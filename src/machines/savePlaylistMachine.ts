import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { createAndPopulatePlaylist } from "../lib/spotify/spotifyApi"
import { SpotifyPlaylist } from "../types/SpotifyPlaylist"

interface Context {
  playlistMeta: SpotifyPlaylist | null
  playlistError: any
  accessToken?: string
}

type SavePlaylistEvent =
  | {
      type: "SAVE_PLAYLIST"
      name: string
      uris: string[]
    }
  | {
      type: "ADMIN_SAVE_PLAYLIST"
      name: string
      uris: string[]
    }
  | {
      type: "PLAYLIST_SAVED"
      data: SpotifyPlaylist
    }
  | {
      type: "SAVE_PLAYLIST_FAILED"
      error: any
    }
  | {
      type: "done.invoke.savePlaylist"
      data: SpotifyPlaylist
    }

async function savePlaylist(ctx: Context, event: SavePlaylistEvent) {
  if (!ctx.accessToken) {
    throw new Error("No access token found")
  }
  if (event.type !== "SAVE_PLAYLIST") {
    throw new Error("Cannot save playlist from client")
  }
  const res = await createAndPopulatePlaylist({
    name: event.name,
    uris: event.uris,
    accessToken: ctx.accessToken,
  })
  return res
}

export const savePlaylistMachine = createMachine<Context, SavePlaylistEvent>(
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
            target: "loading.server",
            actions: ["savePlaylist"],
          },
          SAVE_PLAYLIST: {
            target: "loading.client",
          },
        },
      },
      loading: {
        states: {
          client: {
            invoke: {
              id: "savePlaylist",
              src: savePlaylist,
              onDone: {
                target: "#success",
                actions: ["setPlaylistMeta"],
              },
              onError: {
                target: "#error",
                actions: ["setPlaylistError"],
              },
            },
          },
          server: {
            on: {
              PLAYLIST_SAVED: {
                target: "#success",
                actions: ["setPlaylistMeta"],
              },
              SAVE_PLAYLIST_FAILED: {
                target: "#error",
                actions: ["setPlaylistError"],
              },
            },
          },
        },
      },
      success: {
        id: "success",
        after: {
          1000: "idle",
        },
      },
      error: {
        id: "error",
        after: {
          1000: "idle",
        },
      },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
        cond: ["hasNoAccessToken"],
      },
    ],
  },
  {
    actions: {
      savePlaylist: sendTo("socket", (_ctx, event) => {
        if (event.type == "ADMIN_SAVE_PLAYLIST") {
          return {
            type: "save playlist",
            data: { name: event.name, uris: event.uris },
          }
        }
      }),
      setPlaylistMeta: assign({
        playlistMeta: (ctx, event) => {
          const matchingEvent =
            event.type === "PLAYLIST_SAVED" ||
            event.type === "done.invoke.savePlaylist"
          if (!matchingEvent) {
            return ctx.playlistMeta
          }
          return event.data ? event.data : ctx.playlistMeta
        },
      }),
      setPlaylistError: assign({
        playlistError: (_ctx, event) => {
          return event.error
        },
      }),
    },
  },
)
