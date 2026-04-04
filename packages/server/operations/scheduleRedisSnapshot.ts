import type { AppContext, PluginPreset, RoomScheduleSnapshotDTO, SegmentDTO } from "@repo/types"
import { findRoom } from "./data"
import * as scheduling from "../services/SchedulingService"
import { findRoomIdsByShowId } from "./showPublish"

export type ShowRowForSnapshot = NonNullable<Awaited<ReturnType<typeof scheduling.findShowById>>>

export function roomScheduleSnapshotKey(roomId: string): string {
  return `room:${roomId}:schedule_snapshot`
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/** Builds JSON payload for Redis; exported for unit tests. */
export function buildRoomScheduleSnapshotPayload(show: ShowRowForSnapshot): RoomScheduleSnapshotDTO {
  const ordered = [...(show.segments ?? [])].sort((a, b) => a.position - b.position)
  const segments = ordered.map((ss) => {
    const seg = ss.segment as unknown as SegmentDTO
    const durationMinutes = (ss.durationOverride ?? seg.duration) ?? 0
    const pluginPreset = (seg.pluginPreset as PluginPreset | null | undefined) ?? null
    return {
      segmentId: ss.segmentId,
      position: ss.position,
      durationOverride: ss.durationOverride,
      durationMinutes,
      segment: {
        title: seg.title,
        pluginPreset,
      },
    }
  })
  return {
    version: 1,
    showId: show.id,
    showTitle: show.title,
    startTime: toIso(show.startTime as Date | string),
    updatedAt: new Date().toISOString(),
    segments,
  }
}

async function emitShowScheduleUpdated(
  context: AppContext,
  roomId: string,
  showId: string | null,
  snapshot: RoomScheduleSnapshotDTO | null,
): Promise<void> {
  if (!context.systemEvents) return
  try {
    await context.systemEvents.emit(roomId, "SHOW_SCHEDULE_UPDATED", { roomId, showId, snapshot })
  } catch (e) {
    console.error("[scheduleSnapshot] SHOW_SCHEDULE_UPDATED emit failed", roomId, e)
  }
}

export async function readRoomScheduleSnapshot(
  context: AppContext,
  roomId: string,
): Promise<RoomScheduleSnapshotDTO | null> {
  const raw = await context.redis.pubClient.get(roomScheduleSnapshotKey(roomId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as RoomScheduleSnapshotDTO
  } catch {
    return null
  }
}

/**
 * Rewrite or delete `room:{roomId}:schedule_snapshot` from Postgres, then notify the room.
 */
export async function refreshRoomScheduleSnapshot(context: AppContext, roomId: string): Promise<void> {
  const key = roomScheduleSnapshotKey(roomId)
  try {
    const room = await findRoom({ context, roomId })
    if (!room?.showId) {
      await context.redis.pubClient.del(key)
      await emitShowScheduleUpdated(context, roomId, null, null)
      return
    }

    const show = await scheduling.findShowById(room.showId)
    if (!show) {
      await context.redis.pubClient.del(key)
      await emitShowScheduleUpdated(context, roomId, room.showId, null)
      return
    }

    if (!show.segments?.length) {
      await context.redis.pubClient.del(key)
      await emitShowScheduleUpdated(context, roomId, show.id, null)
      return
    }

    const payload = buildRoomScheduleSnapshotPayload(show)
    await context.redis.pubClient.set(key, JSON.stringify(payload))
    await emitShowScheduleUpdated(context, roomId, show.id, payload)
  } catch (e) {
    console.error("[scheduleSnapshot] refreshRoomScheduleSnapshot failed", roomId, e)
  }
}

/** Refresh snapshot for every Redis room whose `showId` matches. */
export async function refreshScheduleSnapshotForShow(
  context: AppContext,
  showId: string,
): Promise<void> {
  const roomIds = await findRoomIdsByShowId(context, showId)
  for (const roomId of roomIds) {
    await refreshRoomScheduleSnapshot(context, roomId)
  }
}
