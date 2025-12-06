import { assign, setup } from "xstate"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"

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

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
export const savePlaylistMachine = setup({
  types: {
    context: {} as Context,
    events: {} as SavePlaylistEvent,
  },
  actions: {
    savePlaylist: ({ event }) => {
      if (event.type === "SAVE_PLAYLIST") {
        console.log("[savePlaylistMachine] Sending to socket:", {
          name: event.name,
          trackIds: event.trackIds,
        })
        emitToSocket("SAVE_PLAYLIST", { name: event.name, trackIds: event.trackIds })
      }
    },
    setPlaylistMeta: assign({
      playlistMeta: ({ event }) => {
        if (event.type === "PLAYLIST_SAVED") {
          return event.data
        }
        return null
      },
    }),
    setPlaylistError: assign({
      playlistError: ({ event }) => {
        if (event.type === "SAVE_PLAYLIST_FAILED") {
          return event.error
        }
        return null
      },
    }),
    notifyPlaylistCreated: () => {
      toast({
        title: "Playlist saved",
        description: "Your playlist has been saved",
        status: "success",
        duration: 4000,
      })
    },
    notifyPlaylistCreateFailed: ({ context }) => {
      console.error("[savePlaylistMachine] Error:", context.playlistError)
      const errorMessage =
        context.playlistError?.message ||
        (typeof context.playlistError === "string" ? context.playlistError : null) ||
        "Failed to save playlist"
      toast({
        title: "Playlist failed",
        description: errorMessage,
        status: "error",
        duration: 4000,
      })
    },
  },
}).createMachine({
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
})
