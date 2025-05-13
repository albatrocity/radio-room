import sendMessage from "../lib/sendMessage";
import systemMessage from "../lib/systemMessage";
import refreshSpotifyToken from "../operations/spotify/refreshSpotifyToken";
import syncQueue from "../operations/spotify/syncQueue";

import { HandlerConnections } from "../types/HandlerConnections";
import { SearchOptions } from "../types/SpotifyApi";
import { SpotifyEntity } from "../types/SpotifyEntity";
import { User } from "../types/User";
import { getSpotifyApiForRoom } from "../operations/spotify/getSpotifyApi";
import createAndPopulateSpotifyPlaylist from "../operations/spotify/createAndPopulateSpotifyPlaylist";

import {
  addDj,
  addToQueue,
  findRoom,
  getDjs,
  getQueue,
  getUser,
  isDj,
  removeDj,
  updateUserAttributes,
} from "../operations/data";
import { pubUserJoined } from "../operations/sockets/users";
import { makeSpotifyApi } from "../lib/spotifyApi";

export async function djDeputizeUser(
  { io, socket }: HandlerConnections,
  userId: User["userId"]
) {
  const storedUser = await getUser(userId);
  const socketId = storedUser?.id;

  let eventType, message, isDeputyDj;

  const userIsDj = await isDj(socket.data.roomId, userId);

  if (userIsDj) {
    eventType = "END_DEPUTY_DJ_SESSION";
    message = "You are no longer a deputy DJ";
    isDeputyDj = false;
    await removeDj(socket.data.roomId, userId);
  } else {
    eventType = "START_DEPUTY_DJ_SESSION";
    message =
      "You've been promoted to a deputy DJ. You may now add songs to the DJ's queue.";
    isDeputyDj = true;
    await addDj(socket.data.roomId, userId);
  }

  const { user, users } = await updateUserAttributes(
    userId,
    { isDeputyDj },
    socket.data.roomId
  );

  if (socketId) {
    io.to(socketId).emit(
      "event",
      {
        type: "NEW_MESSAGE",
        data: systemMessage(message, { type: "alert", status: "info" }),
      },
      { status: "info" }
    );

    io.to(socketId).emit("event", { type: eventType });
  }

  pubUserJoined({ io }, socket.data.roomId, { user, users });
}

export async function queueSong(
  { socket, io }: HandlerConnections,
  uri: SpotifyEntity["uri"]
) {
  try {
    const currentUser = await getUser(socket.data.userId);
    await syncQueue(socket.data.roomId);

    const queue = await getQueue(socket.data.roomId);

    const inQueue = queue.find((x) => x.uri === uri);

    if (inQueue) {
      const djUsername = (await getUser(inQueue.userId))?.username ?? "Someone";

      socket.emit("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message:
            inQueue.userId === socket.data.userId
              ? "You've already queued that song, please choose another"
              : `${djUsername} has already queued that song. Please try a different song.`,
        },
      });
      return;
    }
    const spotifyApi = await getSpotifyApiForRoom(socket.data.roomId);
    const data = await spotifyApi.addToQueue(uri);
    await addToQueue(socket.data.roomId, {
      uri,
      userId: socket.data.userId,
      username: currentUser?.username,
    });

    socket.emit("event", {
      type: "SONG_QUEUED",
      data,
    });
    const queueMessage = systemMessage(
      `${
        currentUser ? currentUser.username : "Someone"
      } added a song to the queue`
    );
    sendMessage(io, socket.data.roomId, queueMessage);
  } catch (e) {
    socket.emit("event", {
      type: "SONG_QUEUE_FAILURE",
      data: {
        message: "Song could not be queued",
        error: e,
      },
    });
  }
}

export async function searchSpotifyTrack(
  { socket }: HandlerConnections,
  { query, options }: { query: string; options: SearchOptions }
) {
  try {
    const spotifyApi = await getSpotifyApiForRoom(socket.data.roomId);
    const data = await spotifyApi.searchTracks(query, options);
    socket.emit("event", {
      type: "TRACK_SEARCH_RESULTS",
      data: data.body.tracks,
    });
  } catch (e) {
    const token = await refreshSpotifyToken(socket.data.userId);
    if (token) {
      const spotifyApi = makeSpotifyApi({
        accessToken: token,
      });
      spotifyApi.setAccessToken(token);
    }
    socket.emit("event", {
      type: "TRACK_SEARCH_RESULTS_FAILURE",
      data: {
        message:
          "Something went wrong when trying to search for tracks. You might need to log in to Spotify's OAuth",
        error: e,
      },
    });
  }
}

export async function savePlaylist(
  { socket }: HandlerConnections,
  { name, uris }: { name: string; uris: SpotifyEntity["uri"][] }
) {
  try {
    const data = await createAndPopulateSpotifyPlaylist(
      name,
      uris,
      socket.data.userId
    );
    socket.emit("event", { type: "PLAYLIST_SAVED", data });
  } catch (error) {
    socket.emit("event", { type: "SAVE_PLAYLIST_FAILED", error });
  }
}

export async function getSavedTracks({ socket }: HandlerConnections) {
  try {
    const spotifyApi = await getSpotifyApiForRoom(socket.data.roomId);
    const data = await spotifyApi.getMySavedTracks();
    socket.emit("event", { type: "SAVED_TRACKS_RESULTS", data: data.body });
  } catch (error) {
    console.error(error);
    socket.emit("event", { type: "SAVED_TRACKS_RESULTS_FAILURE", error });
  }
}

export async function handleUserJoined(
  { io, socket }: HandlerConnections,
  { user }: { user: User; users: User[] }
) {
  const room = await findRoom(socket.data.roomId);
  const deputyDjs = await getDjs(socket.data.roomId);
  if (room?.deputizeOnJoin && !deputyDjs.includes(user.userId)) {
    djDeputizeUser({ io, socket }, user.userId);
  }
}
