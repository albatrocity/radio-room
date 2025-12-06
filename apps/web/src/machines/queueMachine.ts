import { assign, setup } from "xstate"
import { toast } from "../lib/toasts"
import { MetadataSourceTrack } from "@repo/types"
import { getIsAdmin } from "../actors/authActor"
import { canAddToQueue } from "../actors/djActor"
import { emitToSocket } from "../actors/socketActor"

export interface QueueContext {
  queuedTrack: MetadataSourceTrack | null | undefined
}

type QueueEvent =
  | { type: "SEND_TO_QUEUE"; track: MetadataSourceTrack }
  | { type: "SONG_QUEUED" }
  | { type: "SONG_QUEUE_FAILURE"; data?: { message: string } }

// NOTE: This machine requires socket events. Use with useSocketMachine hook.
export const queueMachine = setup({
  types: {
    context: {} as QueueContext,
    events: {} as QueueEvent,
  },
  guards: {
    canQueue: () => {
      const isAdmin = getIsAdmin()
      const canDj = canAddToQueue()
      return isAdmin || canDj
    },
  },
  actions: {
    setQueuedTrack: assign(({ event }) => {
      if (event.type === "SEND_TO_QUEUE") {
        return { queuedTrack: event.track }
      }
      return {}
    }),
    sendToQueue: ({ event }) => {
      if (event.type === "SEND_TO_QUEUE") {
        emitToSocket("QUEUE_SONG", event.track.id)
      }
    },
    notifyQueued: ({ context }) => {
      toast({
        title: `Added to Queue`,
        description: `${context.queuedTrack?.title} will play sometime soon`,
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      })
    },
    notifyQueueFailure: ({ event }) => {
      if (event.type === "SONG_QUEUE_FAILURE") {
        toast({
          title: `Track was not added`,
          description: event.data?.message || "Something went wrong",
          status: "error",
          duration: 4000,
          isClosable: true,
          position: "top",
        })
      }
    },
  },
}).createMachine({
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
          guard: "canQueue",
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
})
