import type { AppContext, QueueItemAttribution } from "@repo/types"
import type { Room } from "@repo/types/Room"
import { findShowSegmentTracks } from "../services/SchedulingService"
import { DJService } from "../services/DJService"
import { findRoom, getQueue, isRoomAdmin, setQueue } from "./data"
import { getQueueWithDispatched } from "./data/djs"
import { isAppControlledPlayback } from "../lib/roomTypeHelpers"

export type SegmentTrackInjectionPlacement = "top" | "bottom"

type ErrorBody = { status: number; error: string; message: string }

export type InjectSegmentTracksResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: ErrorBody }

async function emitQueueChanged(context: AppContext, roomId: string, room: Room): Promise<void> {
  if (!context.systemEvents) return
  const queue = isAppControlledPlayback(room)
    ? await getQueueWithDispatched({ context, roomId })
    : await getQueue({ context, roomId })
  await context.systemEvents.emit(roomId, "QUEUE_CHANGED", { roomId, queue })
}

export async function injectSegmentTracksToQueue(params: {
  context: AppContext
  roomId: string
  userId: string
  showSegmentId: string
  placement: SegmentTrackInjectionPlacement
  segmentTitle: string
}): Promise<InjectSegmentTracksResult> {
  const { context, roomId, userId, showSegmentId, placement, segmentTitle } = params

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
  if (!isAdmin) {
    return {
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    }
  }

  if (placement === "top" && !isAppControlledPlayback(room)) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "Top placement is only available in app-controlled playback mode.",
      },
    }
  }

  const tracks = await findShowSegmentTracks(showSegmentId)
  if (tracks.length === 0) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "This segment placement has no attached tracks.",
      },
    }
  }

  const attribution: QueueItemAttribution = {
    type: "plugin",
    pluginName: "scheduler",
    displayName: segmentTitle,
  }

  const djService = new DJService(context)
  let added = 0
  let skipped = 0
  const addedTrackIds: string[] = []

  for (const row of tracks) {
    const trackId = row.spotifyTrackId ?? row.mediaSourceTrackId
    if (!trackId) {
      skipped++
      continue
    }

    const result = await djService.queueSongAs(roomId, attribution, trackId, {
      runPluginValidation: false,
      suppressQueueChanged: true,
    })

    if (result.success) {
      added++
      addedTrackIds.push(trackId)
    } else {
      skipped++
    }
  }

  if (placement === "top" && addedTrackIds.length > 0) {
    const queue = await getQueue({ context, roomId })
    const addedSet = new Set(addedTrackIds)
    const addedItems = addedTrackIds
      .map((id) => queue.find((item) => item.track.id === id))
      .filter((item): item is NonNullable<typeof item> => item != null)
    const rest = queue.filter((item) => !addedSet.has(item.track.id))
    await setQueue({ roomId, items: [...addedItems, ...rest], context })
  }

  await emitQueueChanged(context, roomId, room)

  return { ok: true, added, skipped }
}
