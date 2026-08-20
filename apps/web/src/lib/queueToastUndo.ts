import type { MetadataSourceTrack, QueueItem } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"
import socket from "./socket"
import { toast } from "./toasts"

type AckPayload = { type?: string; data?: { message?: string; trackId?: string } }

function listenForTrackAck(successType: string, failureType: string, trackId: string) {
  let timeoutId: number
  const onEvent = (payload: AckPayload) => {
    if (payload.data?.trackId !== trackId) return
    if (payload.type === successType) {
      socket.off("event", onEvent)
      window.clearTimeout(timeoutId)
      return
    }
    if (payload.type === failureType) {
      socket.off("event", onEvent)
      window.clearTimeout(timeoutId)
      toast({
        title: "Couldn't undo",
        description: payload.data?.message || "Something went wrong",
        type: "error",
        duration: 4000,
      })
    }
  }
  socket.on("event", onEvent)
  timeoutId = window.setTimeout(() => socket.off("event", onEvent), 10000)
}

/** Track id to attach to the “Added to Queue” Undo button, or null when dequeue is unavailable. */
export function queuedAddUndoTrackId(params: {
  playbackMode?: string
  queuedItem?: Pick<QueueItem, "track"> | null
  queuedTrack?: Pick<MetadataSourceTrack, "id"> | null
}): string | null {
  if (params.playbackMode !== "app-controlled") return null
  const id = params.queuedItem?.track?.id ?? params.queuedTrack?.id
  return id?.trim() ? id : null
}

export function undoQueuedTrack(trackId: string) {
  listenForTrackAck("REMOVE_FROM_QUEUE_SUCCESS", "REMOVE_FROM_QUEUE_FAILURE", trackId)
  emitToSocket("REMOVE_FROM_QUEUE", { trackId })
}

export function undoHeldQueue(trackId: string) {
  listenForTrackAck("CANCEL_HELD_QUEUE_SUCCESS", "CANCEL_HELD_QUEUE_FAILURE", trackId)
  emitToSocket("CANCEL_HELD_QUEUE", { trackId })
}
