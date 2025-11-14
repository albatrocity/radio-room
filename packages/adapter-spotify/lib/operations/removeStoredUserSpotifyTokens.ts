// fetches a user's spotify tokens from Redis
import {
  SPOTIFY_ACCESS_TOKEN,
  SPOTIFY_REFRESH_TOKEN,
} from "../../lib/constants";
import { createClient } from "../../redisClient";

export default async function removeStoredUserSpotifyTokens(userId: string) {
  const accessKey = `${SPOTIFY_ACCESS_TOKEN}:${userId}`;
  const refreshKey = `${SPOTIFY_REFRESH_TOKEN}:${userId}`;

  const client = await createClient();
  try {
    await client.unlink(accessKey);
    await client.unlink(refreshKey);
    return {
      message: "Successfully removed user's Spotify tokens from Redis",
    };
  } catch (e) {
    console.error(e);
    return { error: String(e) };
  } finally {
    client.disconnect();
  }
}
