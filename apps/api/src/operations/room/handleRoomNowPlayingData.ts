import {
  PUBSUB_PLAYLIST_ADDED,
  PUBSUB_ROOM_NOW_PLAYING_FETCHED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_SPOTIFY_AUTH_ERROR,
  PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
} from "../../lib/constants";
import { pubClient } from "../../lib/redisClients";
import spotifyTrackToPlaylistTrack from "../../lib/spotifyTrackToPlaylistTrack";
import stationMetaToPlaylistTrack from "../../lib/stationMetaToPlaylistTrack";
import { PlaylistTrack } from "../../types/PlaylistTrack";
import { RoomMeta } from "../../types/Room";
import { RoomNowPlaying } from "../../types/RoomNowPlaying";
import { SpotifyError } from "../../types/SpotifyApi";
import { Station } from "../../types/Station";
import {
  addTrackToRoomPlaylist,
  clearRoomCurrent,
  findRoom,
  getQueue,
  getRoomCurrent,
  removeFromQueue,
  setRoomCurrent,
} from "../data";
import { writeJsonToHset } from "../data/utils";

export default async function handleRoomNowPlayingData(
  roomId: string,
  nowPlaying?: RoomNowPlaying,
  stationMeta?: Station,
  forcePublish = false
) {
  // Check currently playing track in the room
  const room = await findRoom(roomId);
  const current = await getRoomCurrent(roomId);

  const isSameTrack = room?.fetchMeta
    ? current?.release?.uri === nowPlaying?.uri
    : current.stationMeta?.title === stationMeta?.title;

  // If there is no currently playing track and the room is set to fetch data from Spotify, clear the current hash and publish
  if (!nowPlaying && room?.fetchMeta) {
    await clearRoomCurrent(roomId);
    await pubSubNowPlaying(roomId, nowPlaying, {
      title: stationMeta?.title,
      lastUpdatedAt: Date.now().toString(),
    });
    return null;
  }

  await writeJsonToHset(`room:${roomId}:current`, {
    stationMeta: JSON.stringify(stationMeta),
  });
  await setRoomCurrent(roomId, {
    release: nowPlaying,
    lastUpdatedAt: Date.now().toString(),
  });
  const updatedCurrent = await getRoomCurrent(roomId);

  // If the currently playing track is the same as the one we just fetched, return early
  if (!forcePublish && isSameTrack) {
    return null;
  }

  await pubSubNowPlaying(roomId, nowPlaying, updatedCurrent);

  // Add the track to the room playlist
  const queue = await getQueue(roomId);
  const inQueue =
    nowPlaying && (queue ?? []).find((track) => track.uri === nowPlaying.uri);

  const playlistTrack = nowPlaying
    ? spotifyTrackToPlaylistTrack(nowPlaying, inQueue)
    : stationMetaToPlaylistTrack(updatedCurrent);

  await addTrackToRoomPlaylist(roomId, playlistTrack);
  await pubPlaylistTrackAdded(roomId, playlistTrack);
  if (inQueue) {
    await removeFromQueue(roomId, inQueue.uri);
  }
}

async function pubSubNowPlaying(
  roomId: string,
  nowPlaying: RoomNowPlaying | undefined,
  meta: RoomMeta
) {
  pubClient.publish(
    PUBSUB_ROOM_NOW_PLAYING_FETCHED,
    JSON.stringify({ roomId, nowPlaying, meta })
  );
}

async function pubPlaylistTrackAdded(
  roomId: string,
  track: Partial<PlaylistTrack>
) {
  pubClient.publish(PUBSUB_PLAYLIST_ADDED, JSON.stringify({ roomId, track }));
}

export async function pubSpotifyError(
  { userId, roomId }: { userId: string; roomId: string },
  error: SpotifyError
) {
  pubClient.publish(
    PUBSUB_SPOTIFY_AUTH_ERROR,
    JSON.stringify({ userId, roomId, error })
  );
}

export async function pubRateLimitError(
  { userId, roomId }: { userId: string; roomId: string },
  error: SpotifyError
) {
  pubClient.publish(
    PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
    JSON.stringify({ userId, roomId, error })
  );
}

export async function pubRoomSettingsUpdated(roomId: string) {
  pubClient.publish(PUBSUB_ROOM_SETTINGS_UPDATED, roomId);
}
