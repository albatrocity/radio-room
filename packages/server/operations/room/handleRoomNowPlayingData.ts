import {
  PUBSUB_PLAYLIST_ADDED,
  PUBSUB_ROOM_NOW_PLAYING_FETCHED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_SPOTIFY_AUTH_ERROR,
  PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
} from "../../lib/constants"
import { pubClient } from "../../lib/redisClients"
import { Queue, QueueItem } from "@repo/types/Queue"
import { RoomMeta } from "@repo/types/Room"
import { MetadataSourceError } from "@repo/types/MetadataSource"
import { Station } from "@repo/types/Station"
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

export default async function handleRoomNowPlayingData(
  roomId: string,
  nowPlaying?: QueueItem,
  stationMeta?: Station,
  forcePublish = false,
) {
  // Check currently playing track in the room
  const room = await findRoom(roomId)
  const current = await getRoomCurrent(roomId)

  const isSameTrack = room?.fetchMeta
    ? current?.nowPlaying?.track.id === nowPlaying?.track.id
    : current.stationMeta?.title === stationMeta?.title

  // If there is no currently playing track and the room is set to fetch data from Spotify, clear the current hash and publish
  if (!nowPlaying && room?.fetchMeta) {
    await clearRoomCurrent(roomId)
    await pubSubNowPlaying(roomId, nowPlaying, {
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
    })
    return null
  }
  if (!nowPlaying) {
    return
  }

  await writeJsonToHset(`room:${roomId}:current`, {
    stationMeta: JSON.stringify(stationMeta),
  })
  await setRoomCurrent(roomId, {
    nowPlaying,
    lastUpdatedAt: Date.now().toString(),
  })
  const updatedCurrent = await getRoomCurrent(roomId)

  // If the currently playing track is the same as the one we just fetched, return early
  if (!forcePublish && isSameTrack) {
    return null
  }

  await pubSubNowPlaying(roomId, nowPlaying, updatedCurrent)

  // Add the track to the room playlist
  const queue = await getQueue(roomId)
  const inQueue = nowPlaying && (queue ?? []).find((item) => item.track.id === nowPlaying.track.id)

  await addTrackToRoomPlaylist(roomId, nowPlaying)
  await pubPlaylistTrackAdded(roomId, nowPlaying)
  if (inQueue) {
    await removeFromQueue(roomId, inQueue.track.id)
  }
}

async function pubSubNowPlaying(roomId: string, nowPlaying: QueueItem | undefined, meta: RoomMeta) {
  pubClient.publish(PUBSUB_ROOM_NOW_PLAYING_FETCHED, JSON.stringify({ roomId, nowPlaying, meta }))
}

async function pubPlaylistTrackAdded(roomId: string, item: Partial<QueueItem>) {
  pubClient.publish(PUBSUB_PLAYLIST_ADDED, JSON.stringify({ roomId, track: item }))
}

export async function pubSpotifyError(
  { userId, roomId }: { userId: string; roomId: string },
  error: MetadataSourceError,
) {
  pubClient.publish(PUBSUB_SPOTIFY_AUTH_ERROR, JSON.stringify({ userId, roomId, error }))
}

export async function pubRateLimitError(
  { userId, roomId }: { userId: string; roomId: string },
  error: MetadataSourceError,
) {
  pubClient.publish(PUBSUB_SPOTIFY_RATE_LIMIT_ERROR, JSON.stringify({ userId, roomId, error }))
}

export async function pubRoomSettingsUpdated(roomId: string) {
  pubClient.publish(PUBSUB_ROOM_SETTINGS_UPDATED, roomId)
}
