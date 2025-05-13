import { getSpotifyApiForUser } from "../../operations/spotify/getSpotifyApi";
import { SpotifyTrack } from "../../types/SpotifyTrack";
import {
  PUBSUB_SPOTIFY_AUTH_ERROR,
  PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
} from "../../lib/constants";
import { pubClient } from "../../lib/redisClients";
import { SpotifyError } from "../../types/SpotifyApi";
import handleRoomNowPlayingData from "../../operations/room/handleRoomNowPlayingData";

export async function communicateNowPlaying(roomId: string) {
  const room = await pubClient.hGetAll(`room:${roomId}:details`);
  try {
    if (
      room.fetchMeta === "false" ||
      room.spotifyError ||
      room.type !== "jukebox"
    ) {
      return;
    }
    if (room.creator) {
      const nowPlaying = (await fetchNowPlaying(room.creator)) as SpotifyTrack;
      await handleRoomNowPlayingData(roomId, nowPlaying);
    }
    return;
  } catch (e: any) {
    console.error(e);
    if (e.body?.error?.status === 401) {
      pubSpotifyError({ userId: room.creator, roomId }, e.body.error);
    }
    // Rate limited
    if (e.body?.error?.status === 429) {
      // let worker know we've been limited
      pubRateLimitError({ userId: room.creator, roomId }, e.body.error);
    }
    return;
  }
}

async function fetchNowPlaying(userId: string) {
  const api = await getSpotifyApiForUser(userId);
  const nowPlaying = await api.getMyCurrentPlayingTrack();
  return nowPlaying.body.item;
}

async function pubSpotifyError(
  { userId, roomId }: { userId: string; roomId: string },
  error: SpotifyError
) {
  pubClient.publish(
    PUBSUB_SPOTIFY_AUTH_ERROR,
    JSON.stringify({ userId, roomId, error })
  );
}

async function pubRateLimitError(
  { userId, roomId }: { userId: string; roomId: string },
  error: SpotifyError
) {
  pubClient.publish(
    PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
    JSON.stringify({ userId, roomId, error })
  );
}
