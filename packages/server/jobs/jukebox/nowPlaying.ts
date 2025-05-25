import { QueueItem } from "@repo/types/Queue"
import { PUBSUB_SPOTIFY_AUTH_ERROR, PUBSUB_SPOTIFY_RATE_LIMIT_ERROR } from "../../lib/constants"
import { pubClient } from "../../lib/redisClients"
import { MetadataSourceError } from "@repo/types/MetadataSource"
import handleRoomNowPlayingData from "../../operations/room/handleRoomNowPlayingData"

export async function communicateNowPlaying(roomId: string) {
  const room = await pubClient.hGetAll(`room:${roomId}:details`)
  try {
    if (room.fetchMeta === "false" || room.spotifyError || room.type !== "jukebox") {
      return
    }
    if (room.creator) {
      // TODO: is this still needed?
      // const nowPlaying = (await fetchNowPlaying(room.creator)) as SpotifyTrack;
      // await handleRoomNowPlayingData(roomId, nowPlaying);
    }
    return
  } catch (e: any) {
    console.error(e)
    if (e.body?.error?.status === 401) {
      pubMetadataSourceError({ userId: room.creator, roomId }, e.body.error)
    }
    // Rate limited
    if (e.body?.error?.status === 429) {
      // let worker know we've been limited
      pubRateLimitError({ userId: room.creator, roomId }, e.body.error)
    }
    return
  }
}

// async function fetchNowPlaying(userId: string) {
//   const api = await getSpotifyApiForUser(userId);
//   const nowPlaying = await api.getMyCurrentPlayingTrack();
//   return nowPlaying.body.item;
// }

async function pubMetadataSourceError(
  { userId, roomId }: { userId: string; roomId: string },
  error: MetadataSourceError,
) {
  pubClient.publish(PUBSUB_SPOTIFY_AUTH_ERROR, JSON.stringify({ userId, roomId, error }))
}

async function pubRateLimitError(
  { userId, roomId }: { userId: string; roomId: string },
  error: MetadataSourceError,
) {
  pubClient.publish(PUBSUB_SPOTIFY_RATE_LIMIT_ERROR, JSON.stringify({ userId, roomId, error }))
}
