import {
  PUBSUB_PLAYLIST_ADDED,
  PUBSUB_METADATA_SOURCE_AUTH_ERROR,
  PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR,
} from "../../lib/constants"
import { MetadataSourceError, AppContext, QueueItem, Station, Room, MediaData } from "@repo/types"
import {
  addTrackToRoomPlaylist,
  clearRoomCurrent,
  findRoom,
  getQueue,
  getRoomCurrent,
  removeFromQueue,
  setRoomCurrent,
} from "../data"
import { writeJsonToHset } from "../data/utils"

type HandleRoomNowPlayingDataParams = {
  context: AppContext
  roomId: string
  data?: MediaData // Track data from MediaSource
  stationMeta?: Station // Legacy support for radio rooms
  error?: string // Optional error message (for error status emission)
}

/**
 * Central handler for media data from MediaSources.
 *
 * This function:
 * 1. Checks if the track is new (using Redis as source of truth)
 * 2. Constructs a QueueItem from MediaData
 * 3. Enriches with queue data (addedBy, addedAt)
 * 4. Persists to Redis
 * 5. Updates playlist/queue
 * 6. Emits events via SystemEvents
 */
export default async function handleRoomNowPlayingData({
  context,
  roomId,
  data,
  stationMeta,
  error,
}: HandleRoomNowPlayingDataParams) {
  const room = await findRoom({ context, roomId })

  // Use stationMeta from data if not provided directly (for new API)
  const effectiveStationMeta = stationMeta ?? data?.stationMeta

  // Determine source type for status events
  const sourceType = room?.type === "radio" ? ("radio" as const) : ("jukebox" as const)

  // Handle no track playing (offline or error state)
  if (!data) {
    // Only clear current if room is configured to fetch metadata
    if (room?.fetchMeta) {
      await clearRoomCurrent({ context, roomId })
    }

    // Emit appropriate status based on whether there's an error
    if (context.systemEvents) {
      const status = error ? ("error" as const) : ("offline" as const)
      await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
        roomId,
        status,
        sourceType,
        error,
      })
    }
    return null
  }

  // Check if this is the same track as currently playing (using Redis as source of truth)
  const current = await getRoomCurrent({ context, roomId })
  const isSameTrack = checkSameTrack(current, data, room, effectiveStationMeta)

  if (isSameTrack) {
    console.log(
      `[handleRoomNowPlayingData] Same track detected, skipping processing for room ${roomId}`,
    )
    return null
  }

  // Store station meta if provided
  if (effectiveStationMeta) {
    await writeJsonToHset({
      context,
      setKey: `room:${roomId}:current`,
      attributes: {
        stationMeta: JSON.stringify(effectiveStationMeta),
      },
    })
  }

  // Get queue to determine DJ (who added the track)
  const queue = await getQueue({ context, roomId })
  const queuedTrack = queue?.find(
    (item) =>
      item.mediaSource.type === data.mediaSource.type &&
      item.mediaSource.trackId === data.mediaSource.trackId,
  )

  // Preserve DJ from current if this is the same track (being re-processed)
  // Otherwise, use the DJ from the queue if the track was queued
  const trackDj = queuedTrack?.addedBy

  // Construct QueueItem from MediaData
  const nowPlaying: QueueItem = {
    title: data.track.title,
    track: data.track,
    mediaSource: data.mediaSource,
    metadataSource: data.metadataSource,
    addedAt: queuedTrack?.addedAt ?? Date.now(),
    addedBy: trackDj,
    addedDuring: queuedTrack ? "queue" : "nowPlaying",
    playedAt: Date.now(),
  }

  // Build complete RoomMeta with all display fields
  const completeMeta = {
    nowPlaying,
    dj: trackDj,
    title: data.track.title,
    artist: data.track.artists?.map((a) => a.title).join(", "),
    album: data.track.album?.title,
    track: data.track.title,
    artwork: room?.artwork || data.track.album?.images?.[0]?.url,
    lastUpdatedAt: Date.now().toString(),
    stationMeta: effectiveStationMeta,
    release: nowPlaying, // backward compatibility
  }

  // Save complete meta to Redis
  await setRoomCurrent({
    context,
    roomId,
    meta: completeMeta,
  })

  const updatedCurrent = await getRoomCurrent({ context, roomId })

  // Emit trackChanged event via SystemEvents (broadcasts to PubSub + Plugins + Socket.IO)
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "TRACK_CHANGED", {
      roomId,
      track: nowPlaying,
      meta: updatedCurrent,
    })

    // Emit media source status - if we got track data, the media source is online
    await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId,
      status: "online" as const,
      sourceType,
      bitrate:
        room?.type === "radio" && effectiveStationMeta?.bitrate
          ? Number(effectiveStationMeta.bitrate)
          : undefined,
    })
  }

  // Add the track to the room playlist
  const playlistItem = queuedTrack
    ? {
        ...nowPlaying,
        addedAt: queuedTrack.addedAt, // Preserve original queue timestamp
        playedAt: Date.now(), // Mark when it actually started playing
      }
    : nowPlaying

  await addTrackToRoomPlaylist({ context, roomId, item: playlistItem })
  await pubPlaylistTrackAdded({ context, roomId, item: playlistItem })

  // Remove from queue if it was queued
  if (queuedTrack) {
    const trackKey = `${queuedTrack.mediaSource.type}:${queuedTrack.mediaSource.trackId}`
    await removeFromQueue({ context, roomId, trackId: trackKey })
  }
}

/**
 * Check if the incoming track is the same as the currently playing track.
 * Uses mediaSource for stable identity comparison.
 */
function checkSameTrack(
  current: Awaited<ReturnType<typeof getRoomCurrent>>,
  data: MediaData,
  room: Room | null | undefined,
  stationMeta?: Station,
): boolean {
  if (!current?.nowPlaying?.mediaSource) {
    return false
  }

  const sameMediaSource =
    current.nowPlaying.mediaSource.type === data.mediaSource.type &&
    current.nowPlaying.mediaSource.trackId === data.mediaSource.trackId

  // For radio rooms, also verify station title (handles same track playing multiple times)
  if (room?.type === "radio" && stationMeta?.title && current?.stationMeta?.title) {
    return sameMediaSource && current.stationMeta.title === stationMeta.title
  }

  return sameMediaSource
}

// ============================================================================
// PubSub helpers
// ============================================================================

type PubPlaylistTrackAddedParams = {
  context: AppContext
  roomId: string
  item: Partial<QueueItem>
}

async function pubPlaylistTrackAdded({ context, roomId, item }: PubPlaylistTrackAddedParams) {
  context.redis.pubClient.publish(PUBSUB_PLAYLIST_ADDED, JSON.stringify({ roomId, track: item }))
}

type PubMetadataSourceErrorParams = {
  context: AppContext
  userId: string
  roomId: string
  error: MetadataSourceError
}

/**
 * Publish metadata source authentication error
 */
export async function pubMetadataSourceError({
  context,
  userId,
  roomId,
  error,
}: PubMetadataSourceErrorParams) {
  context.redis.pubClient.publish(
    PUBSUB_METADATA_SOURCE_AUTH_ERROR,
    JSON.stringify({ userId, roomId, error }),
  )
}

type PubMetadataSourceRateLimitErrorParams = {
  context: AppContext
  userId: string
  roomId: string
  error: MetadataSourceError
}

/**
 * Publish metadata source rate limit error
 */
export async function pubMetadataSourceRateLimitError({
  context,
  userId,
  roomId,
  error,
}: PubMetadataSourceRateLimitErrorParams) {
  context.redis.pubClient.publish(
    PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR,
    JSON.stringify({ userId, roomId, error }),
  )
}

// Deprecated aliases for backward compatibility
/** @deprecated Use pubMetadataSourceError */
export const pubSpotifyError = pubMetadataSourceError
/** @deprecated Use pubMetadataSourceRateLimitError */
export const pubRateLimitError = pubMetadataSourceRateLimitError

type PubRoomSettingsUpdatedParams = {
  context: AppContext
  roomId: string
  room?: Room // Optional - will fetch if not provided
}

export async function pubRoomSettingsUpdated({
  context,
  roomId,
  room,
}: PubRoomSettingsUpdatedParams) {
  // Fetch room if not provided
  let roomData: Room | null | undefined = room
  if (!roomData) {
    const { findRoom } = await import("../data/rooms")
    roomData = await findRoom({ context, roomId })
  }

  // Emit via SystemEvents if we have room data
  if (roomData && context.systemEvents) {
    await context.systemEvents.emit(roomId, "ROOM_SETTINGS_UPDATED", {
      roomId,
      room: roomData,
    })
  }
}
