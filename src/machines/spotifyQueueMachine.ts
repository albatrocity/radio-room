import { assign, sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { toast } from "../lib/toasts"
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
    initial: "idle",
    context: {
      queuedTrack: null,
    },
    states: {
      idle: {
        on: {
          SEND_TO_QUEUE: {
            target: "loading",
            actions: ["setQueuedTrack", "sendToQueue"],
            cond: "canQueue",
          },
        },
      },
      loading: {
        on: {
          SONG_QUEUED: { target: "idle", actions: ["notifyQueued"] },
          SONG_QUEUE_FAILURE: {
            target: "idle",
            actions: ["notifyQueueFailure"],
          },
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
      notifyQueued: (context) => {
        toast({
          title: `Added to Queue`,
          description: `${context.queuedTrack?.name} will play sometime soon`,
          status: "success",
          duration: 4000,
          isClosable: true,
          position: "top",
        })
      },
      notifyQueueFailure: (_context, event) => {
        toast({
          title: `Track was not added`,
          description: event.data?.message || "Something went wrong",
          status: "error",
          duration: 4000,
          isClosable: true,
          position: "top",
        })
      },
    },
  },
)
