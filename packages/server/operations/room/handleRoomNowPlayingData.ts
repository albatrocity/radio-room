import {
  PUBSUB_PLAYLIST_ADDED,
  PUBSUB_ROOM_NOW_PLAYING_FETCHED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_SPOTIFY_AUTH_ERROR,
  PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
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
  nowPlaying?: QueueItem
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

  const isSameTrack = room?.fetchMeta
    ? current?.nowPlaying?.track.id === nowPlaying?.track.id
    : current.stationMeta?.title === stationMeta?.title

  // If there is no currently playing track and the room is set to fetch data from Spotify, clear the current hash and publish
  if (!nowPlaying && room?.fetchMeta) {
    await clearRoomCurrent({ context, roomId })
    await pubSubNowPlaying({
      context,
      roomId,
      nowPlaying,
      meta: {
        nowPlaying: {
          track: {
            title: stationMeta?.title ?? "Unknown",
            artists: [],
            album: {
              title: stationMeta?.title ?? "Unknown",
              artists: [],
              images: [],
              urls: [],
              id: `album-${Date.now()}`,
              label: "Unknown",
              releaseDate: "Unknown",
              releaseDatePrecision: "day",
              totalTracks: 0,
            },
            duration: 0,
            id: `track-${Date.now()}`,
            discNumber: 0,
            explicit: false,
            images: [],
            popularity: 0,
            trackNumber: 0,
            urls: [],
          },
          addedAt: Date.now(),
          addedBy: undefined,
          addedDuring: "nowPlaying",
          playedAt: Date.now(),
        },
        lastUpdatedAt: Date.now().toString(),
      },
    })
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

  await setRoomCurrent({
    context,
    roomId,
    meta: {
      nowPlaying,
      lastUpdatedAt: Date.now().toString(),
    },
  })

  const updatedCurrent = await getRoomCurrent({ context, roomId })

  // If the currently playing track is the same as the one we just fetched, return early
  if (!forcePublish && isSameTrack) {
    return null
  }

  await pubSubNowPlaying({ context, roomId, nowPlaying, meta: updatedCurrent })

  // Add the track to the room playlist
  const queue = await getQueue({ context, roomId })
  const inQueue = nowPlaying && (queue ?? []).find((item) => item.track.id === nowPlaying.track.id)

  await addTrackToRoomPlaylist({ context, roomId, item: nowPlaying })
  await pubPlaylistTrackAdded({ context, roomId, item: nowPlaying })
  if (inQueue) {
    await removeFromQueue({ context, roomId, trackId: inQueue.track.id })
  }
}

type PubSubNowPlayingParams = {
  context: AppContext
  roomId: string
  nowPlaying: QueueItem | undefined
  meta: RoomMeta
}

async function pubSubNowPlaying({ context, roomId, nowPlaying, meta }: PubSubNowPlayingParams) {
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

type PubSpotifyErrorParams = {
  context: AppContext
  userId: string
  roomId: string
  error: MetadataSourceError
}

export async function pubSpotifyError({ context, userId, roomId, error }: PubSpotifyErrorParams) {
  context.redis.pubClient.publish(
    PUBSUB_SPOTIFY_AUTH_ERROR,
    JSON.stringify({ userId, roomId, error }),
  )
}

type PubRateLimitErrorParams = {
  context: AppContext
  userId: string
  roomId: string
  error: MetadataSourceError
}

export async function pubRateLimitError({
  context,
  userId,
  roomId,
  error,
}: PubRateLimitErrorParams) {
  context.redis.pubClient.publish(
    PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
    JSON.stringify({ userId, roomId, error }),
  )
}

type PubRoomSettingsUpdatedParams = {
  context: AppContext
  roomId: string
}

export async function pubRoomSettingsUpdated({ context, roomId }: PubRoomSettingsUpdatedParams) {
  context.redis.pubClient.publish(PUBSUB_ROOM_SETTINGS_UPDATED, roomId)
}
