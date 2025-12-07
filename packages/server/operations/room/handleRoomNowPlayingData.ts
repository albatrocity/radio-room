import {
  PUBSUB_METADATA_SOURCE_AUTH_ERROR,
  PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR,
} from "../../lib/constants"
import {
  MetadataSourceError,
  AppContext,
  QueueItem,
  Room,
  MediaSourceSubmission,
  MetadataSourceTrack,
  MetadataSourceTrackData,
} from "@repo/types"
import type { MetadataSourceType } from "@repo/types/TrackSource"
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
  const { track, metadataSource, metadataSources } = await resolveTrackData(
    context,
    room,
    submission,
  )

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
    metadataSources,
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

type ResolveTrackDataResult = {
  track: MetadataSourceTrack
  metadataSource?: { type: MetadataSourceType; trackId: string }
  metadataSources?: Record<MetadataSourceType, MetadataSourceTrackData | undefined>
}

/**
 * Resolve track data - use enrichedTrack as primary if provided, but still fetch
 * from all configured MetadataSources to support user preferences.
 *
 * Fetches from all configured metadata sources in parallel.
 * The enrichedTrack (if provided) or first successful result populates `track`,
 * all successful results go in `metadataSources`.
 */
async function resolveTrackData(
  context: AppContext,
  room: Room | null | undefined,
  submission: MediaSourceSubmission,
): Promise<ResolveTrackDataResult> {
  const metadataSourceIds = room?.metadataSourceIds

  // If we have an enrichedTrack and no additional metadata sources configured,
  // just use what we have
  if (submission.enrichedTrack && (!metadataSourceIds || metadataSourceIds.length <= 1)) {
    return {
      track: submission.enrichedTrack,
      metadataSource: submission.metadataSource,
    }
  }

  // If no fetchMeta or no metadata sources configured, fall back to raw/enriched
  if (!room?.fetchMeta || !metadataSourceIds?.length) {
    if (submission.enrichedTrack) {
      return {
        track: submission.enrichedTrack,
        metadataSource: submission.metadataSource,
      }
    }
    return {
      track: createRawTrack(submission),
      metadataSource: undefined,
    }
  }

  // Build the search query
  const query = submission.artist
    ? `${submission.artist} ${submission.title}`.trim()
    : submission.title

  // Determine which source already provided enriched data (if any)
  const enrichedSourceType = submission.metadataSource?.type as MetadataSourceType | undefined

  // Filter out the source that already provided enriched data - no need to search it again
  const sourcesToSearch = metadataSourceIds.filter((id) => id !== enrichedSourceType)

  console.log(
    `[handleRoomNowPlayingData] Enriching track via ${sourcesToSearch.length} MetadataSource(s): "${query}"` +
      (enrichedSourceType ? ` (skipping ${enrichedSourceType} - already have data)` : ""),
  )

  // Get all metadata sources for the room
  const adapterService = new AdapterService(context)
  const metadataSources = await adapterService.getRoomMetadataSources(room.id)

  if (metadataSources.size === 0 && !submission.enrichedTrack) {
    console.log(`[handleRoomNowPlayingData] No metadata sources available for room ${room.id}`)
    return {
      track: createRawTrack(submission),
      metadataSource: undefined,
    }
  }

  // Fetch from sources that don't already have data (in parallel)
  const searchPromises = Array.from(metadataSources.entries())
    .filter(([sourceId]) => sourceId !== enrichedSourceType) // Skip the source that provided enrichedTrack
    .map(
      async ([sourceId, source]): Promise<{
        sourceId: string
        track: MetadataSourceTrack | null
        error?: Error
      }> => {
        try {
          if (!source?.api?.search) {
            console.log(`[handleRoomNowPlayingData] ${sourceId}: No search API available`)
            return { sourceId, track: null }
          }

          console.log(`[handleRoomNowPlayingData] ${sourceId}: Searching for "${query}"...`)
          const searchResults = await source.api.search(query)
          if (searchResults && searchResults.length > 0) {
            console.log(
              `[handleRoomNowPlayingData] ✓ ${sourceId}: Found "${searchResults[0].title}"`,
            )
            return { sourceId, track: searchResults[0] }
          }

          console.log(`[handleRoomNowPlayingData] ✗ ${sourceId}: No results for "${query}"`)
          return { sourceId, track: null }
        } catch (error: any) {
          const errorMsg = error?.message || String(error)

          // Check for re-authentication needed
          if (errorMsg.includes("re-authenticate") || errorMsg.includes("invalid_user_grant")) {
            console.log(
              `[handleRoomNowPlayingData] ${sourceId}: ⚠️ Re-authentication needed - refresh token invalid`,
            )
          }
          // Token/auth errors are expected for rooms where creator hasn't authenticated
          else if (
            errorMsg.includes("token") ||
            errorMsg.includes("auth") ||
            errorMsg.includes("401")
          ) {
            console.log(`[handleRoomNowPlayingData] ${sourceId}: Auth required, skipping`)
          } else {
            console.error(`[handleRoomNowPlayingData] ${sourceId}: Error:`, error)
          }
          return { sourceId, track: null, error }
        }
      },
    )

  const results = await Promise.all(searchPromises)

  // Find successful results
  const successfulResults = results.filter((r) => r.track !== null)

  // Build the metadataSources record with all successful results
  const metadataSourcesRecord: Record<MetadataSourceType, MetadataSourceTrackData | undefined> = {
    spotify: undefined,
    tidal: undefined,
    applemusic: undefined,
  }

  for (const result of successfulResults) {
    const sourceType = result.sourceId as MetadataSourceType
    metadataSourcesRecord[sourceType] = {
      source: {
        type: sourceType,
        trackId: result.track!.id,
      },
      track: result.track!,
    }
  }

  // If we have an enrichedTrack, use it as primary but include other sources
  if (submission.enrichedTrack) {
    // Also add the enriched track to metadataSources if its source type is known
    if (submission.metadataSource) {
      const sourceType = submission.metadataSource.type as MetadataSourceType
      metadataSourcesRecord[sourceType] = {
        source: submission.metadataSource,
        track: submission.enrichedTrack,
      }
    }

    return {
      track: submission.enrichedTrack,
      metadataSource: submission.metadataSource,
      metadataSources: metadataSourcesRecord,
    }
  }

  // No enrichedTrack - use first successful result as primary
  if (successfulResults.length === 0) {
    console.log(`[handleRoomNowPlayingData] No metadata found from any source for "${query}"`)
    return {
      track: createRawTrack(submission),
      metadataSource: undefined,
    }
  }

  const primary = successfulResults[0]
  const primaryTrack = primary.track!
  const primarySourceType = primary.sourceId as MetadataSourceType

  return {
    track: primaryTrack,
    metadataSource: {
      type: primarySourceType,
      trackId: primaryTrack.id,
    },
    metadataSources: metadataSourcesRecord,
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
    artists: submission.artist ? [{ id: "unknown", title: submission.artist, urls: [] }] : [],
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
