import { assign, setup } from "xstate"
import { QueueItem, MetadataSourceType } from "@repo/types"
import { toast } from "../lib/toasts"
import { emitToSocket } from "../actors/socketActor"

interface PlaylistMetadata {
  id: string
  title: string
  url?: string
  skippedTracks?: number // Tracks that couldn't be matched to the target service
}

interface Context {
  playlistMeta: PlaylistMetadata | null
  playlistError: any
}

type SavePlaylistEvent =
  | {
      type: "SAVE_PLAYLIST"
      name: string
      items: QueueItem[] // Send full items so we can extract the right track IDs
      targetService: MetadataSourceType // Which service to save to
      roomId?: string // Room ID for the playlist
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
        // Extract track IDs for the target service from metadataSources
        const trackData = event.items.map((item) => {
          // Try to get track ID from the specific metadata source
          const sourceData = item.metadataSources?.[event.targetService]
          if (sourceData?.source?.trackId) {
            return { 
              trackId: sourceData.source.trackId, 
              found: true, 
              title: item.title,
              artist: item.track.artists?.[0]?.title
            }
          }
          // Fallback: if target is spotify and we have a mediaSource with spotify type
          if (event.targetService === "spotify" && item.mediaSource?.type === "spotify") {
            return { 
              trackId: item.mediaSource.trackId, 
              found: true,
              title: item.title,
              artist: item.track.artists?.[0]?.title
            }
          }
          // Track not available for this service
          return { 
            trackId: null, 
            found: false,
            title: item.title,
            artist: item.track.artists?.[0]?.title
          }
        })

        const matchedTracks = trackData.filter((t) => t.found).map((t) => t.trackId!)
        const skippedTracks = trackData.filter((t) => !t.found)

        console.log("[savePlaylistMachine] Sending to socket:", {
          name: event.name,
          targetService: event.targetService,
          totalTracks: event.items.length,
          matchedTracks: matchedTracks.length,
          skippedTracks: skippedTracks.length,
        })

        if (matchedTracks.length === 0) {
          // No tracks could be matched - emit error locally
          toast({
            title: "Playlist failed",
            description: `No tracks found for ${event.targetService}. Try a different service.`,
            status: "error",
            duration: 4000,
          })
          return
        }

        // Note: Unavailable tracks are now shown disabled in the UI with tooltips,
        // so we don't need a warning toast here

        emitToSocket("SAVE_PLAYLIST", {
          name: event.name,
          trackIds: matchedTracks,
          targetService: event.targetService,
          roomId: event.roomId,
        })
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
