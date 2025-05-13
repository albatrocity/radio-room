import { Server } from "socket.io";
import {
  PUBSUB_ROOM_NOW_PLAYING_FETCHED,
  PUBSUB_PLAYLIST_ADDED,
} from "../../lib/constants";
import { pubClient, subClient } from "../../lib/redisClients";
import getRoomPath from "../../lib/getRoomPath";
import { SpotifyTrack } from "../../types/SpotifyTrack";
import { findRoom, makeJukeboxCurrentPayload } from "../../operations/data";
import { PlaylistTrack } from "../../types/PlaylistTrack";
import { PubSubHandlerArgs } from "../../types/PubSub";
import { RoomMeta } from "../../types/Room";
import systemMessage from "../../lib/systemMessage";
import sendMessage from "../../lib/sendMessage";

export default async function bindHandlers(io: Server) {
  subClient.pSubscribe(PUBSUB_ROOM_NOW_PLAYING_FETCHED, (message, channel) =>
    handleNowPlaying({ io, message, channel })
  );
  subClient.pSubscribe(PUBSUB_PLAYLIST_ADDED, (message, channel) =>
    handlePlaylistAdded({ io, message, channel })
  );
}

async function handleNowPlaying({ io, message, channel }: PubSubHandlerArgs) {
  const {
    roomId,
    nowPlaying,
    meta,
  }: { nowPlaying: SpotifyTrack; roomId: string; meta: RoomMeta } =
    JSON.parse(message);
  const payload = await makeJukeboxCurrentPayload(roomId, nowPlaying, meta);
  io.to(getRoomPath(roomId)).emit("event", payload);

  const room = await findRoom(roomId);

  if (room?.announceNowPlaying && nowPlaying) {
    const msg = systemMessage(
      `Now playing: ${nowPlaying.name} ${
        nowPlaying.artists?.[0]?.name ? `by ${nowPlaying.artists[0].name}` : ""
      }`,
      "success"
    );
    sendMessage(io, roomId, msg);
  }
}

async function handlePlaylistAdded({ io, message }: PubSubHandlerArgs) {
  const { roomId, track }: { track: PlaylistTrack; roomId: string } =
    JSON.parse(message);
  io.to(getRoomPath(roomId)).emit("event", {
    type: "PLAYLIST_TRACK_ADDED",
    data: { track },
  });
}
