import type { AppContext, QueueItem, RoomMeta } from "@repo/types"
import { clearRoomCurrent, findRoom, getRoomCurrent, setRoomCurrent } from "../data"
import { readRoomScheduleSnapshot } from "../scheduleRedisSnapshot"
import handleRoomNowPlayingData from "./handleRoomNowPlayingData"
import { makeStableTrackId } from "../../lib/makeNowPlayingFromStationMeta"

/**
 * Clear current now-playing state, rebuild a submission from cached station
 * metadata, and re-run `handleRoomNowPlayingData` so the persisted RoomMeta
 * reflects the latest room/segment display settings.
 */
export async function refreshNowPlayingFromStationMeta(
  context: AppContext,
  roomId: string,
): Promise<void> {
  const current = await clearRoomCurrent({ context, roomId })
  const stationMeta = current?.stationMeta

  if (stationMeta?.title) {
    const parts = stationMeta.title.split("|").map((s) => s.trim())
    const submission = {
      trackId: makeStableTrackId(stationMeta),
      sourceType: "shoutcast" as const,
      title: parts[0] || "Unknown",
      artist: parts[1],
      album: parts[2],
      stationMeta,
    }

    await handleRoomNowPlayingData({
      context,
      roomId,
      submission,
    })
  }
}

/**
 * Transition into streaming mode: clear track data and set up a minimal
 * room-branding display (room title, optional segment title, room artwork).
 */
export async function enterStreamingMode(
  context: AppContext,
  roomId: string,
): Promise<void> {
  await clearRoomCurrent({ context, roomId })

  const room = await findRoom({ context, roomId })
  if (!room) return

  let segmentTitle: string | undefined
  if (room.showSchedulePublic && room.activeSegmentId) {
    segmentTitle = (await getActiveSegmentTitle(context, roomId, room.activeSegmentId)) ?? undefined
  }

  const artists: Array<{ id: string; title: string; urls: [] }> = segmentTitle
    ? [{ id: "segment", title: segmentTitle, urls: [] }]
    : []

  const nowPlaying: QueueItem = {
    title: room.title,
    track: {
      id: "streaming-mode",
      title: room.title,
      artists,
      album: {
        id: "streaming-mode",
        title: "",
        artists: [],
        releaseDate: "",
        releaseDatePrecision: "day",
        totalTracks: 0,
        label: "",
        images: [],
        urls: [],
      },
      duration: 0,
      explicit: false,
      trackNumber: 0,
      discNumber: 0,
      popularity: 0,
      images: [],
      urls: [],
    },
    mediaSource: { type: "shoutcast", trackId: "streaming-mode" },
    addedAt: Date.now(),
    playedAt: Date.now(),
  }

  const meta: RoomMeta = {
    nowPlaying,
    title: room.title,
    artist: segmentTitle ?? "",
    album: "",
    track: room.title,
    artwork: room.artwork,
    lastUpdatedAt: Date.now().toString(),
  }

  await setRoomCurrent({ context, roomId, meta })
  const updatedCurrent = await getRoomCurrent({ context, roomId })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "TRACK_CHANGED", {
      roomId,
      track: nowPlaying,
      meta: updatedCurrent,
    })

    await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId,
      status: "online" as const,
      sourceType: "radio" as const,
    })
  }
}

/**
 * When `fetchMeta` toggles, apply the appropriate transition:
 * - ON -> OFF: enter streaming mode (room-branding display)
 * - OFF -> ON: re-process cached station meta as a real track
 */
export async function applyFetchMetaTransitionEffects(params: {
  context: AppContext
  roomId: string
  previousFetchMeta: boolean
  newFetchMeta: boolean
}): Promise<void> {
  const { context, roomId, previousFetchMeta, newFetchMeta } = params
  if (previousFetchMeta === newFetchMeta) return

  if (!newFetchMeta) {
    await enterStreamingMode(context, roomId)
  } else {
    await refreshNowPlayingFromStationMeta(context, roomId)
  }
}

async function getActiveSegmentTitle(
  context: AppContext,
  roomId: string,
  activeSegmentId: string,
): Promise<string | null> {
  try {
    const snapshot = await readRoomScheduleSnapshot(context, roomId)
    if (!snapshot) return null
    const seg = snapshot.segments.find((s) => s.segmentId === activeSegmentId)
    return seg?.segment.title ?? null
  } catch {
    return null
  }
}
