import { createClient } from "../redisClient";
import SpotifyWebApi from "spotify-web-api-node";

import { SPOTIFY_ACCESS_TOKEN } from "../lib/constants";

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

type SpotifyTokenCredentials = {
  accessToken?: string;
  refreshToken?: string;
};

export async function getSpotifyToken(userId: string) {
  const client = await createClient();
  try {
    const token = await client.get(`${SPOTIFY_ACCESS_TOKEN}:${userId}}`);
    return token;
  } catch (e) {
    console.error(e);
    return null;
  } finally {
    await client.disconnect();
  }
}

export function makeSpotifyApi(options: SpotifyTokenCredentials = {}) {
  return new SpotifyWebApi({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: redirect_uri,
    ...options,
  });
}

export async function setApiToken(userId: string, spotifyApi: SpotifyWebApi) {
  const token = await getSpotifyToken(userId);
  if (token) {
    spotifyApi.setAccessToken(token);
  }
}
