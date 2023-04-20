import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { SpotifyTrack } from "../types/SpotifyTrack"
import { useDjStore } from "../state/djStore"
import { useAuthStore } from "../state/authStore"

interface Context {
  queuedTrack: SpotifyTrack | null | undefined
}

export const spotifyQueueMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "spotify-queue",
    context: {
      queuedTrack: null,
    },
    on: {
      SEND_TO_QUEUE: {
        target: ".",
        actions: ["setQueuedTrack", "sendToQueue"],
        cond: "canQueue",
      },
      SONG_QUEUED: { actions: ["onQueued"] },
      SONG_QUEUE_FAILURE: { actions: ["onQueueFailure"] },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
  },
  {
    guards: {
      canQueue: () => {
        const djState = useDjStore.getState().state
        const isAdmin = useAuthStore.getState().state.context.isAdmin
        return (
          isAdmin ||
          djState.matches("djaying") ||
          djState.matches("deputyDjaying")
        )
      },
    },
    actions: {
      setQueuedTrack: assign((_context, event) => ({
        queuedTrack: event.track,
      })),
      sendToQueue: sendTo("socket", (_ctx, event) => {
        return {
          type: "queue song",
          data: event.track.uri,
        }
      }),
    },
  },
)
