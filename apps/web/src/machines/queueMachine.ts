import { assign, setup } from "xstate"
import { toast } from "../lib/toasts"
import { queuedAddUndoTrackId, undoHeldQueue, undoQueuedTrack } from "../lib/queueToastUndo"
import { MetadataSourceTrack, QueueItem } from "@repo/types"
import { getIsAdmin } from "../actors/authActor"
import { getCurrentRoom } from "../actors/roomActor"
import { canAddToQueue } from "../actors/djActor"
import { emitToSocket } from "../actors/socketActor"
import { shakeArmedQueueAddButtonIfPlaybackMissing, disarmQueueAddButtonShake } from "../lib/queueAddButtonShake"

export interface QueueContext {
  queuedTrack: MetadataSourceTrack | null | undefined
}

/** SERVER_EVENT allowlist for `useSocketMachine` (ADR 0093) — keep in sync with `QueueEvent`. */
export const QUEUE_EVENT_TYPES = ["SONG_QUEUED", "SONG_QUEUE_HELD", "SONG_QUEUE_FAILURE"]

type QueueEvent =
  | { type: "SEND_TO_QUEUE"; track: MetadataSourceTrack }
  | { type: "SONG_QUEUED"; data?: QueueItem }
  | { type: "SONG_QUEUE_HELD"; data?: { message: string } }
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
        const source = (event.track as { source?: string }).source
        emitToSocket("QUEUE_SONG", source ? { trackId: event.track.id, source } : event.track.id)
      }
    },
    notifyQueued: ({ context, event }) => {
      if (event.type !== "SONG_QUEUED") return
      disarmQueueAddButtonShake()
      const undoTrackId = queuedAddUndoTrackId({
        playbackMode: getCurrentRoom()?.playbackMode,
        queuedItem: event.data,
        queuedTrack: context.queuedTrack,
      })
      toast({
        title: `Added to Queue`,
        description: `${context.queuedTrack?.title} has been added to the queue`,
        status: "success",
        duration: 4000,
        isClosable: true,
        ...(undoTrackId
          ? { action: { label: "Undo", onClick: () => undoQueuedTrack(undoTrackId) } }
          : {}),
      })
    },
    notifyQueueHeld: ({ event, context }) => {
      if (event.type !== "SONG_QUEUE_HELD") return
      disarmQueueAddButtonShake()
      const undoTrackId = context.queuedTrack?.id?.trim() || null
      toast({
        title: "Song saved for your turn",
        description:
          event.data?.message ||
          `${context.queuedTrack?.title ?? "Your song"} will be added when it's your turn`,
        status: "info",
        duration: 5000,
        isClosable: true,
        ...(undoTrackId
          ? { action: { label: "Undo", onClick: () => undoHeldQueue(undoTrackId) } }
          : {}),
      })
    },
    notifyQueueFailure: ({ event }) => {
      if (event.type === "SONG_QUEUE_FAILURE") {
        shakeArmedQueueAddButtonIfPlaybackMissing(event.data?.message)
        toast({
          title: `Track was not added`,
          description: event.data?.message || "Something went wrong",
          status: "error",
          duration: 4000,
          isClosable: true,
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
        SONG_QUEUE_HELD: { target: "idle", actions: ["notifyQueueHeld"] },
        SONG_QUEUE_FAILURE: {
          target: "idle",
          actions: ["notifyQueueFailure"],
        },
      },
    },
  },
})
