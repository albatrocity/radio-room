import { Server } from "socket.io";
import {
  PUBSUB_SPOTIFY_AUTH_ERROR,
  PUBSUB_RADIO_ERROR,
} from "../../lib/constants";
import { pubClient, subClient } from "../../lib/redisClients";
import { getUser } from "../../operations/data";
import { PubSubHandlerArgs } from "../../types/PubSub";
import { SpotifyError } from "../../types/SpotifyApi";
import getRoomPath from "../../lib/getRoomPath";
import { pubRoomSettingsUpdated } from "../../operations/room/handleRoomNowPlayingData";

export default async function bindHandlers(io: Server) {
  subClient.pSubscribe(PUBSUB_SPOTIFY_AUTH_ERROR, (message, channel) =>
    handleSpotifyError({ io, message, channel })
  );
  subClient.pSubscribe(PUBSUB_RADIO_ERROR, (message, channel) =>
    handleRadioError({ io, message, channel })
  );
}

function getErrorMessage(status: number) {
  switch (status) {
    case 401:
      return "Your Spotify account has been disconnected. Please log back into Spotify.";
    case 403:
      return "You are not authorized to perform this action.";
    case 404:
      return "The requested resource could not be found.";
    default:
      return "An error occurred with Spotify. Please try again later.";
  }
}

async function handleSpotifyError({ io, message }: PubSubHandlerArgs) {
  const {
    userId,
    roomId,
    error,
  }: { userId: string; roomId?: string; error: SpotifyError } =
    JSON.parse(message);

  const user = await getUser(userId);
  if (user?.id) {
    io.to(user.id).emit("event", {
      type: "ERROR",
      data: {
        status: error.status,
        message: getErrorMessage(error.status),
        error: error.reason,
        duration: null,
        id: "spotify-auth-401",
      },
    });
  }

  if (roomId) {
    await pubClient.hSet(
      `room:${roomId}:details`,
      "spotifyError",
      JSON.stringify(error)
    );
  }
}

async function handleRadioError({ io, message }: PubSubHandlerArgs) {
  const { roomId, error }: { userId: string; roomId?: string; error: Error } =
    JSON.parse(message);
  if (roomId) {
    io.to(getRoomPath(roomId)).emit("event", {
      type: "ERROR",
      data: {
        status: 500,
        message:
          "Fetching the radio station failed. Please check the radio station URL and protocol in the room settings.",
        duration: null,
        id: "radio-error",
      },
    });

    await pubClient.hSet(
      `room:${roomId}:details`,
      "radioError",
      JSON.stringify({ message: String(error.message), status: 500 })
    );

    await pubRoomSettingsUpdated(roomId);
  }
}
