import {
  PUBSUB_METADATA_SOURCE_AUTH_ERROR,
  PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR,
} from "../../lib/constants"
import {
  MetadataSourceError,
  AppContext,
  QueueItem,
  Station,
  Room,
  MediaSourceSubmission,
  MetadataSourceTrack,
} from "@repo/types"
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
import { AdapterService } from "../../services/AdapterService"

type HandleRoomNowPlayingDataParams = {
  context: AppContext
  roomId: string
  submission?: MediaSourceSubmission
  error?: string
}

/**
 * Central handler for media data from MediaSources.
 *
 * This function:
 * 1. Checks if the track is new (using Redis as source of truth)
 * 2. Enriches with MetadataSource if needed (based on room config)
 * 3. Constructs a QueueItem
 * 4. Enriches with queue data (addedBy, addedAt)
 * 5. Persists to Redis
 * 6. Updates playlist/queue
 * 7. Emits events via SystemEvents
 */
export default async function handleRoomNowPlayingData({
  context,
  roomId,
  submission,
  error,
}: HandleRoomNowPlayingDataParams) {
  const room = await findRoom({ context, roomId })

  // Determine source type for status events
  const sourceType = room?.type === "radio" ? ("radio" as const) : ("jukebox" as const)

  // Handle no submission (offline or error state)
  if (!submission) {
    if (room?.fetchMeta) {
      await clearRoomCurrent({ context, roomId })
    }

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

  // Check if this is the same track as currently playing
  const current = await getRoomCurrent({ context, roomId })
  if (isSameTrack(current, submission, room)) {
    console.log(
      `[handleRoomNowPlayingData] Same track detected, skipping processing for room ${roomId}`,
    )
    return null
  }

  // Store station meta if provided
  if (submission.stationMeta) {
    await writeJsonToHset({
      context,
      setKey: `room:${roomId}:current`,
      attributes: {
        stationMeta: JSON.stringify(submission.stationMeta),
      },
    })
  }

  // Determine the track data to use (enriched or raw)
  const { track, metadataSource } = await resolveTrackData(context, room, submission)

  // Get queue to determine DJ (who added the track)
  const queue = await getQueue({ context, roomId })
  const queuedTrack = queue?.find(
    (item) =>
      item.mediaSource.type === submission.sourceType &&
      item.mediaSource.trackId === submission.trackId,
  )
  const trackDj = queuedTrack?.addedBy

  // Construct QueueItem
  const nowPlaying: QueueItem = {
    title: track.title,
    track,
    mediaSource: {
      type: submission.sourceType,
      trackId: submission.trackId,
    },
    metadataSource,
    addedAt: queuedTrack?.addedAt ?? Date.now(),
    addedBy: trackDj,
    addedDuring: queuedTrack ? "queue" : "nowPlaying",
    playedAt: Date.now(),
  }

  // Build complete RoomMeta
  const completeMeta = {
    nowPlaying,
    dj: trackDj,
    title: track.title,
    artist: track.artists?.map((a) => a.title).join(", "),
    album: track.album?.title,
    track: track.title,
    artwork: room?.artwork || track.album?.images?.[0]?.url,
    lastUpdatedAt: Date.now().toString(),
    stationMeta: submission.stationMeta,
    release: nowPlaying,
  }

  // Save to Redis
  await setRoomCurrent({ context, roomId, meta: completeMeta })
  const updatedCurrent = await getRoomCurrent({ context, roomId })

  // Emit events
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "TRACK_CHANGED", {
      roomId,
      track: nowPlaying,
      meta: updatedCurrent,
    })

    await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId,
      status: "online" as const,
      sourceType,
      bitrate:
        room?.type === "radio" && submission.stationMeta?.bitrate
          ? Number(submission.stationMeta.bitrate)
          : undefined,
    })
  }

  // Add to playlist
  const playlistItem: QueueItem = queuedTrack
    ? { ...nowPlaying, addedAt: queuedTrack.addedAt, playedAt: Date.now() }
    : nowPlaying

  await addTrackToRoomPlaylist({ context, roomId, item: playlistItem })

  if (context.systemEvents) {
    let trackToEmit = playlistItem
    if (context.pluginRegistry) {
      trackToEmit = await context.pluginRegistry.augmentPlaylistItem(roomId, playlistItem)
    }
    await context.systemEvents.emit(roomId, "PLAYLIST_TRACK_ADDED", {
      roomId,
      track: trackToEmit,
    })
  }

  // Remove from queue if it was queued
  if (queuedTrack) {
    const trackKey = `${queuedTrack.mediaSource.type}:${queuedTrack.mediaSource.trackId}`
    await removeFromQueue({ context, roomId, trackId: trackKey })
  }
}

/**
 * Check if the incoming submission is the same as currently playing.
 */
function isSameTrack(
  current: Awaited<ReturnType<typeof getRoomCurrent>>,
  submission: MediaSourceSubmission,
  room: Room | null | undefined,
): boolean {
  if (!current?.nowPlaying?.mediaSource) {
    return false
  }

  const sameMediaSource =
    current.nowPlaying.mediaSource.type === submission.sourceType &&
    current.nowPlaying.mediaSource.trackId === submission.trackId

  // For radio rooms, also verify station title
  if (room?.type === "radio" && submission.stationMeta?.title && current?.stationMeta?.title) {
    return sameMediaSource && current.stationMeta.title === submission.stationMeta.title
  }

  return sameMediaSource
}

/**
 * Resolve track data - use enrichedTrack if provided, otherwise enrich via MetadataSource,
 * or fall back to constructing from raw data.
 */
async function resolveTrackData(
  context: AppContext,
  room: Room | null | undefined,
  submission: MediaSourceSubmission,
): Promise<{ track: MetadataSourceTrack; metadataSource?: { type: any; trackId: string } }> {
  // If enrichedTrack is provided, use it (MediaSource already has rich data)
  if (submission.enrichedTrack) {
    return {
      track: submission.enrichedTrack,
      metadataSource: submission.metadataSource,
    }
  }

  // Try to enrich via room's MetadataSource if configured
  if (room?.fetchMeta && room?.metadataSourceId) {
    try {
      const adapterService = new AdapterService(context)
      const metadataSource = await adapterService.getRoomMetadataSource(room.id)

      if (metadataSource?.api?.search) {
        const query = submission.artist
          ? `${submission.artist} ${submission.title}`.trim()
          : submission.title

        console.log(`[handleRoomNowPlayingData] Enriching track via MetadataSource: "${query}"`)
        const searchResults = await metadataSource.api.search(query)

        if (searchResults && searchResults.length > 0) {
          const enrichedTrack = searchResults[0]
          console.log(`[handleRoomNowPlayingData] ✓ Enriched track: "${enrichedTrack.title}"`)
          return {
            track: enrichedTrack,
            metadataSource: {
              type: room.metadataSourceId as any,
              trackId: enrichedTrack.id,
            },
          }
        }

        console.log(`[handleRoomNowPlayingData] ✗ No metadata found for "${query}"`)
      }
    } catch (error: any) {
      // Token/auth errors are expected for rooms where creator hasn't authenticated
      if (error?.message?.includes("token") || error?.message?.includes("auth")) {
        console.log(
          `[handleRoomNowPlayingData] MetadataSource auth required for room ${room.id}, using raw data`,
        )
      } else {
        console.error(`[handleRoomNowPlayingData] Error enriching track:`, error)
      }
    }
  }

  // Fall back to constructing from raw submission data
  return {
    track: createRawTrack(submission),
    metadataSource: undefined,
  }
}

/**
 * Create a minimal MetadataSourceTrack from raw submission data.
 */
function createRawTrack(submission: MediaSourceSubmission): MetadataSourceTrack {
  return {
    id: submission.trackId,
    title: submission.title,
    urls: [],
    artists: submission.artist
      ? [{ id: "unknown", title: submission.artist, urls: [] }]
      : [],
    album: submission.album
      ? {
          id: "unknown",
          title: submission.album,
          urls: [],
          artists: [],
          releaseDate: "",
          releaseDatePrecision: "year",
          totalTracks: 0,
          label: "",
          images: [],
        }
      : {
          id: "unknown",
          title: "",
          urls: [],
          artists: [],
          releaseDate: "",
          releaseDatePrecision: "year",
          totalTracks: 0,
          label: "",
          images: [],
        },
    duration: 0,
    explicit: false,
    trackNumber: 0,
    discNumber: 0,
    popularity: 0,
    images: [],
  }
}

// ============================================================================
// PubSub helpers
// ============================================================================

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
