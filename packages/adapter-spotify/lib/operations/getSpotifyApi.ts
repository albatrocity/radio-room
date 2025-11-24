import { makeSpotifyApi } from "../../lib/spotifyApi";
import { findRoom } from "../data";
import getStoredUserSpotifyTokens from "./getStoredUserSpotifyTokens";

export async function getSpotifyApiForUser(userId: string = "app") {
  const { accessToken, refreshToken } = await getStoredUserSpotifyTokens(
    userId
  );

  if (!accessToken) {
    throw new Error(`No access token found for user ${userId}`);
  }
  const spotifyApi = makeSpotifyApi({
    accessToken,
    refreshToken: refreshToken ?? undefined,
  });
  return spotifyApi;
}

export async function getSpotifyApiForRoom(roomId: string) {
  const room = await findRoom(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }
  if (!room.creator) {
    throw new Error(`Room Creator for ${roomId} not found`);
  }

  const { accessToken, refreshToken } = await getStoredUserSpotifyTokens(
    room.creator
  );

  if (!accessToken) {
    throw new Error(`No access token found for user ${room.creator}`);
  }

  const spotifyApi = makeSpotifyApi({
    accessToken,
    refreshToken: refreshToken ?? undefined,
  });

  return spotifyApi;
}
