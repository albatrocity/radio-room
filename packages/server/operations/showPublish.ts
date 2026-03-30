import {
  db,
  roomExport,
  roomPlaylistTrack,
  show,
  showSegment,
  segment,
} from "@repo/db"
import { eq, and, inArray } from "drizzle-orm"
import type { AppContext } from "@repo/types"
import type { QueueItem } from "@repo/types/Queue"
import type { RoomExportDTO, RoomExportPlaylistLinks } from "@repo/types"
import * as scheduling from "../services/SchedulingService"
import { findRoom, getRoomPlaylist, deleteRoom } from "./data"
import { ExportService } from "../services/ExportService"
import { AdapterService } from "../services/AdapterService"
import { DJService } from "../services/DJService"

export async function findRoomIdsByShowId(context: AppContext, showId: string): Promise<string[]> {
  const roomIds = await context.redis.pubClient.sMembers("rooms")
  const matches: string[] = []
  for (const roomId of roomIds) {
    const room = await findRoom({ context, roomId })
    if (room?.showId === showId) {
      matches.push(roomId)
    }
  }
  return matches
}

function extractServiceTrackId(item: QueueItem, service: "spotify" | "tidal"): string | null {
  const bundle = item.metadataSources?.[service]
  if (bundle?.track?.id) {
    return bundle.track.id
  }
  if (item.metadataSource?.type === service && item.track?.id) {
    return item.track.id
  }
  return null
}

function mapMediaIds(item: QueueItem): {
  mediaSourceType: string | null
  mediaSourceTrackId: string | null
  spotifyTrackId: string | null
  tidalTrackId: string | null
} {
  return {
    mediaSourceType: item.mediaSource?.type ?? null,
    mediaSourceTrackId: item.mediaSource?.trackId ?? null,
    spotifyTrackId: extractServiceTrackId(item, "spotify"),
    tidalTrackId: extractServiceTrackId(item, "tidal"),
  }
}

function toExportDto(row: typeof roomExport.$inferSelect): RoomExportDTO {
  return {
    id: row.id,
    showId: row.showId,
    markdown: row.markdown,
    status: row.status,
    playlistLinks: (row.playlistLinks as RoomExportPlaylistLinks | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Build draft export, persist playlist rows, optionally create Spotify/Tidal playlists (room creator).
 */
export async function prepareShowPublish(showId: string, context: AppContext) {
  const showRecord = await scheduling.findShowById(showId)
  if (!showRecord) {
    throw new scheduling.SchedulingBadRequestError("Show not found")
  }
  if (showRecord.status !== "ready") {
    throw new scheduling.SchedulingBadRequestError("Show must be in ready state to publish")
  }

  let roomId = showRecord.roomId ?? null
  if (!roomId) {
    const found = await findRoomIdsByShowId(context, showId)
    roomId = found[0] ?? null
  }
  if (!roomId) {
    throw new scheduling.SchedulingBadRequestError("No listening room is attached to this show")
  }

  const room = await findRoom({ context, roomId })
  if (!room || room.showId !== showId) {
    throw new scheduling.SchedulingBadRequestError("Room is not attached to this show")
  }

  const playlistItems = await getRoomPlaylist({ context, roomId })
  const exportService = new ExportService(context)
  const markdown = await exportService.exportRoom(roomId, "markdown")

  const adapterService = new AdapterService(context)
  const djService = new DJService(context)
  const playlistLinks: RoomExportPlaylistLinks = {}
  const playlistTitle = `${showRecord.title} (Listening Room)`

  for (const svc of ["spotify", "tidal"] as const) {
    const metadataSource = await adapterService.getMetadataSourceForUser(roomId, room.creator, svc)
    if (!metadataSource?.api?.createPlaylist) {
      continue
    }
    const trackIds = playlistItems
      .map((item: QueueItem) => extractServiceTrackId(item, svc))
      .filter((id: string | null): id is string => !!id)
    if (trackIds.length === 0) {
      continue
    }
    const result = await djService.savePlaylist(
      metadataSource,
      room.creator,
      playlistTitle,
      trackIds,
    )
    if (result.success && result.data) {
      playlistLinks[svc] = {
        id: result.data.id,
        url: result.data.url,
        title: result.data.title,
      }
    }
  }

  const now = new Date()
  const [existing] = await db.select().from(roomExport).where(eq(roomExport.showId, showId)).limit(1)

  let exportRowId: string
  if (existing) {
    exportRowId = existing.id
    await db
      .update(roomExport)
      .set({
        markdown,
        status: "draft",
        playlistLinks,
        updatedAt: now,
      })
      .where(eq(roomExport.id, existing.id))
  } else {
    const [inserted] = await db
      .insert(roomExport)
      .values({
        showId,
        markdown,
        status: "draft",
        playlistLinks,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    exportRowId = inserted!.id
  }

  await db.delete(roomPlaylistTrack).where(eq(roomPlaylistTrack.showId, showId))

  if (playlistItems.length > 0) {
    await db.insert(roomPlaylistTrack).values(
      playlistItems.map((item: QueueItem, index: number) => {
        const ids = mapMediaIds(item)
        return {
          showId,
          roomExportId: exportRowId,
          position: index,
          playedAt: item.playedAt ? new Date(item.playedAt) : null,
          addedAt: item.addedAt ? new Date(item.addedAt) : null,
          title: item.title ?? item.track?.title ?? "",
          addedByUserId: item.addedBy?.userId ?? null,
          mediaSourceType: ids.mediaSourceType,
          mediaSourceTrackId: ids.mediaSourceTrackId,
          spotifyTrackId: ids.spotifyTrackId,
          tidalTrackId: ids.tidalTrackId,
          trackPayload: item,
        }
      }),
    )
  }

  const [fresh] = await db.select().from(roomExport).where(eq(roomExport.id, exportRowId)).limit(1)

  return {
    roomId,
    export: toExportDto(fresh!),
    playlistLinks,
  }
}

/**
 * First publish from `ready`: mark export published, show published, archive non-recurring segments, clear show.room_id, delete Redis room.
 * Re-publish from `published`: update markdown only.
 */
export async function finalizeShowPublish(showId: string, markdown: string, context: AppContext) {
  const [showRow] = await db.select().from(show).where(eq(show.id, showId)).limit(1)
  if (!showRow) {
    throw new scheduling.SchedulingBadRequestError("Show not found")
  }

  if (showRow.status === "published") {
    const [ex] = await db.select().from(roomExport).where(eq(roomExport.showId, showId)).limit(1)
    if (!ex) {
      throw new scheduling.SchedulingBadRequestError("No export exists for this show")
    }
    await db
      .update(roomExport)
      .set({ markdown, updatedAt: new Date() })
      .where(eq(roomExport.id, ex.id))
    const [updated] = await db.select().from(roomExport).where(eq(roomExport.id, ex.id)).limit(1)
    return { export: toExportDto(updated!) }
  }

  if (showRow.status !== "ready") {
    throw new scheduling.SchedulingBadRequestError("Show must be ready or published to finalize export")
  }

  let roomId = showRow.roomId ?? null
  if (!roomId) {
    const found = await findRoomIdsByShowId(context, showId)
    roomId = found[0] ?? null
  }

  const [ex] = await db.select().from(roomExport).where(eq(roomExport.showId, showId)).limit(1)
  if (!ex) {
    throw new scheduling.SchedulingBadRequestError("Run publish prepare before finalize")
  }

  await db.transaction(async (tx) => {
    await tx
      .update(roomExport)
      .set({ markdown, status: "published", updatedAt: new Date() })
      .where(eq(roomExport.id, ex.id))

    await tx
      .update(show)
      .set({ status: "published", roomId: null, updatedAt: new Date() })
      .where(eq(show.id, showId))

    const rows = await tx
      .select({ segmentId: showSegment.segmentId })
      .from(showSegment)
      .where(eq(showSegment.showId, showId))
    const segmentIds = rows.map((r) => r.segmentId)
    if (segmentIds.length > 0) {
      await tx
        .update(segment)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(inArray(segment.id, segmentIds), eq(segment.isRecurring, false)))
    }
  })

  if (roomId) {
    try {
      await deleteRoom({ context, roomId })
    } catch (e) {
      console.error("[finalizeShowPublish] deleteRoom failed (publish succeeded):", roomId, e)
    }
  }

  const [exportAfter] = await db.select().from(roomExport).where(eq(roomExport.id, ex.id)).limit(1)

  return {
    export: toExportDto(exportAfter!),
  }
}
