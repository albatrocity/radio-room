import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { toast } from "../lib/toasts"

interface PlaylistMetadata {
  id: string
  title: string
  url?: string
}

interface Context {
  playlistMeta: PlaylistMetadata | null
  playlistError: any
}

type SavePlaylistEvent =
  | {
      type: "SAVE_PLAYLIST"
      name: string
      trackIds: string[]
    }
  | {
      type: "PLAYLIST_SAVED"
      data: PlaylistMetadata
    }
  | {
      type: "SAVE_PLAYLIST_FAILED"
      error: any
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
          SAVE_PLAYLIST: {
            target: "loading",
            actions: ["savePlaylist"],
          },
        },
      },
      loading: {
        on: {
          PLAYLIST_SAVED: {
            target: "success",
            actions: ["setPlaylistMeta", "notifyPlaylistCreated"],
          },
          SAVE_PLAYLIST_FAILED: {
            target: "error",
            actions: ["setPlaylistError", "notifyPlaylistCreateFailed"],
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
        src: (() => socketService) as any,
      },
    ],
  },
  {
    actions: {
      savePlaylist: sendTo("socket", (_ctx, event) => {
        if (event.type === "SAVE_PLAYLIST") {
          const socketEvent = {
            type: "SAVE_PLAYLIST",
            data: { name: event.name, trackIds: event.trackIds },
          }
          console.log("[savePlaylistMachine] Sending to socket:", socketEvent)
          return socketEvent
        }
      }),
      setPlaylistMeta: assign({
        playlistMeta: (_ctx, event) => {
          if (event.type === "PLAYLIST_SAVED") {
            return event.data
          }
          return null
        },
      }),
      setPlaylistError: assign({
        playlistError: (_ctx, event) => {
          if (event.type === "SAVE_PLAYLIST_FAILED") {
            return event.error
          }
          return null
        },
      }),
      notifyPlaylistCreateFailed: (context) => {
        console.error("[savePlaylistMachine] Error:", context.playlistError)
        const errorMessage = context.playlistError?.message || 
                            (typeof context.playlistError === 'string' ? context.playlistError : null) ||
                            "Failed to save playlist"
        toast({
          title: "Playlist failed",
          description: errorMessage,
          status: "error",
          duration: 4000,
        })
      },
    },
  },
)
