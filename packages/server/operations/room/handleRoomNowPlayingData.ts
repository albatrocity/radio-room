import {
  PUBSUB_PLAYLIST_ADDED,
  PUBSUB_ROOM_NOW_PLAYING_FETCHED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_METADATA_SOURCE_AUTH_ERROR,
  PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR,
} from "../../lib/constants"
import { MetadataSourceError, AppContext, RoomMeta, QueueItem, Station } from "@repo/types"
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
  nowPlaying?: QueueItem  // Optional at function level (might not have data)
  stationMeta?: Station
  forcePublish?: boolean
}

export default async function handleRoomNowPlayingData({
  context,
  roomId,
  nowPlaying,
  stationMeta,
  forcePublish = false,
}: HandleRoomNowPlayingDataParams) {
  // Check currently playing track in the room
  const room = await findRoom({ context, roomId })
  const current = await getRoomCurrent({ context, roomId })

  // Compare using mediaSource (stable, always present when nowPlaying exists)
  // Handle case where current track doesn't exist yet or has old data structure
  let isSameTrack = false
  
  if (current?.nowPlaying?.mediaSource && nowPlaying?.mediaSource) {
    isSameTrack =
      current.nowPlaying.mediaSource.type === nowPlaying.mediaSource.type &&
      current.nowPlaying.mediaSource.trackId === nowPlaying.mediaSource.trackId

    // For radio rooms, also verify station title (handles same track playing multiple times)
    if (room?.type === "radio" && stationMeta?.title && current?.stationMeta?.title) {
      isSameTrack = isSameTrack && current.stationMeta.title === stationMeta.title
    }
  }

  // If the currently playing track is the same as the one we just fetched, return early without publishing
  if (!forcePublish && isSameTrack && nowPlaying) {
    const hasEnrichment = nowPlaying.metadataSource !== undefined
    console.log(
      `[handleRoomNowPlayingData] Same track detected (enriched: ${hasEnrichment}), skipping ALL processing for room ${roomId}`,
    )
    return null
  }

  // If there is no currently playing track and the room is set to fetch data from Spotify, clear the current hash and publish
  if (!nowPlaying && room?.fetchMeta) {
    await clearRoomCurrent({ context, roomId })
    await pubSubNowPlaying({ context, roomId, nowPlaying: undefined, meta: undefined })
    return null
  }
  if (!nowPlaying) {
    return
  }

  await writeJsonToHset({
    context,
    setKey: `room:${roomId}:current`,
    attributes: {
      stationMeta: JSON.stringify(stationMeta),
    },
  })

  // Only update and publish if this is a new track or forced
  await setRoomCurrent({
    context,
    roomId,
    meta: {
      nowPlaying,
      lastUpdatedAt: Date.now().toString(),
    },
  })

  const updatedCurrent = await getRoomCurrent({ context, roomId })
  await pubSubNowPlaying({ context, roomId, nowPlaying, meta: updatedCurrent })

  // Add the track to the room playlist
  const queue = await getQueue({ context, roomId })

  // Find track in queue using mediaSource
  const inQueue =
    nowPlaying &&
    (queue ?? []).find(
      (item) =>
        item.mediaSource.type === nowPlaying.mediaSource.type &&
        item.mediaSource.trackId === nowPlaying.mediaSource.trackId,
    )

  // If this track was in the queue, preserve its original addedAt timestamp
  // This ensures the playlist shows when it was originally queued, not when it started playing
  const playlistItem = inQueue
    ? {
        ...nowPlaying,
        addedAt: inQueue.addedAt, // Preserve original queue timestamp
        playedAt: Date.now(), // Mark when it actually started playing
      }
    : nowPlaying

  await addTrackToRoomPlaylist({ context, roomId, item: playlistItem })
  await pubPlaylistTrackAdded({ context, roomId, item: playlistItem })
  if (inQueue) {
    // Use mediaSource for removal key
    const trackKey = `${inQueue.mediaSource.type}:${inQueue.mediaSource.trackId}`
    await removeFromQueue({ context, roomId, trackId: trackKey })
  }
}

type PubSubNowPlayingParams = {
  context: AppContext
  roomId: string
  nowPlaying: QueueItem | undefined
  meta: RoomMeta | undefined  // Allow undefined for clearing case
}

async function pubSubNowPlaying({ context, roomId, nowPlaying, meta }: PubSubNowPlayingParams) {
  // Skip publish if no meta available
  if (!meta) {
    return
  }
  context.redis.pubClient.publish(
    PUBSUB_ROOM_NOW_PLAYING_FETCHED,
    JSON.stringify({ roomId, nowPlaying, meta }),
  )
}

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
  error 
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
export const pubSpotifyError = pubMetadataSourceError;
/** @deprecated Use pubMetadataSourceRateLimitError */
export const pubRateLimitError = pubMetadataSourceRateLimitError;

type PubRoomSettingsUpdatedParams = {
  context: AppContext
  roomId: string
}

export async function pubRoomSettingsUpdated({ context, roomId }: PubRoomSettingsUpdatedParams) {
  context.redis.pubClient.publish(PUBSUB_ROOM_SETTINGS_UPDATED, roomId)
}
