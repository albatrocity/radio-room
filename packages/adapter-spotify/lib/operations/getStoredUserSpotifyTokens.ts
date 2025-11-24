// fetches a user's spotify tokens from Redis
import {
  SPOTIFY_ACCESS_TOKEN,
  SPOTIFY_REFRESH_TOKEN,
} from "../../lib/constants";
import { createClient } from "../../redisClient";

export default async function getStoredUserSpotifyTokens(userId: string) {
  const accessKey = `${SPOTIFY_ACCESS_TOKEN}:${userId}`;
  const refreshKey = `${SPOTIFY_REFRESH_TOKEN}:${userId}`;

  const client = await createClient();
  try {
    const accessToken = await client.get(accessKey);
    const refreshToken = await client.get(refreshKey);
    return { accessToken, refreshToken };
  } catch (e) {
    console.error(e);
    return { accessToken: undefined, refreshToken: undefined };
  } finally {
    client.disconnect();
  }
}
