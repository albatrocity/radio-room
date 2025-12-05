import { assign, createMachine } from "xstate"
import { toast } from "../lib/toasts"
import { MetadataSourceTrack } from "@repo/types"
import { getIsAdmin } from "../actors/authActor"
import { canAddToQueue } from "../actors/djActor"
import { emitToSocket } from "../actors/socketActor"

export interface QueueContext {
  queuedTrack: MetadataSourceTrack | null | undefined
}

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
export const queueMachine = createMachine<QueueContext>(
  {
    predictableActionArguments: true,
    id: "queue",
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
  },
  {
    guards: {
      canQueue: () => {
        const isAdmin = getIsAdmin()
        const canDj = canAddToQueue()
        return isAdmin || canDj
      },
    },
    actions: {
      setQueuedTrack: assign((_context, event) => ({
        queuedTrack: event.track,
      })),
      sendToQueue: (_ctx, event) => {
        emitToSocket("QUEUE_SONG", event.track.id)
      },
      notifyQueued: (context) => {
        toast({
          title: `Added to Queue`,
          description: `${context.queuedTrack?.title} will play sometime soon`,
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

