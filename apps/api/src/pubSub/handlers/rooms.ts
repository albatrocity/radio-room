import { Server } from "socket.io";
import { subClient } from "../../lib/redisClients";
import {
  PUBSUB_ROOM_DELETED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED,
} from "../../lib/constants";
import { PubSubHandlerArgs } from "../../types/PubSub";
import getRoomPath from "../../lib/getRoomPath";
import systemMessage from "../../lib/systemMessage";
import sendMessage from "../../lib/sendMessage";
import { findRoom } from "../../operations/data";

export default async function bindHandlers(io: Server) {
  subClient.pSubscribe(PUBSUB_ROOM_DELETED, (message, channel) =>
    handleRoomDeleted({ io, message, channel })
  );

  subClient.pSubscribe(
    PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED,
    (message, channel) => {
      handlePlaybackStateChange({ io, message, channel });
    }
  );

  subClient.pSubscribe(PUBSUB_ROOM_SETTINGS_UPDATED, (message, channel) => {
    handleRoomSettingsUpdated({ io, message, channel });
  });
}

async function handleRoomDeleted({ io, message, channel }: PubSubHandlerArgs) {
  const roomId = message;
  io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_DELETED",
    data: {
      roomId,
    },
  });
}

async function handlePlaybackStateChange({ io, message }: PubSubHandlerArgs) {
  const { isPlaying, roomId } = JSON.parse(message);
  const newMessage = systemMessage(
    `Spotify playback has been ${isPlaying ? "resumed" : "paused"}`,
    {
      type: "alert",
    }
  );
  sendMessage(io, roomId, newMessage);
}

async function handleRoomSettingsUpdated({ io, message }: PubSubHandlerArgs) {
  const roomId = message;
  const room = await findRoom(roomId);

  await io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room,
    },
  });
}
