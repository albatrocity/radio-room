import { PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED } from "../../lib/constants";
import { pubClient } from "../../lib/redisClients";
import { delRoomKey, findRoom, updateRoom } from "../../operations/data";
import getStoredUserSpotifyTokens from "../../operations/spotify/getStoredUserSpotifyTokens";
import refreshToken from "../../operations/spotify/refreshSpotifyToken";

export async function refreshSpotifyTokens(roomId: string) {
  const room = await findRoom(roomId);
  if (!room?.creator) {
    return;
  }
  const now = Date.now();
  const lastRefresh = parseInt(room.lastRefreshedAt);
  const { accessToken, refreshToken: storedRefreshToken } =
    await getStoredUserSpotifyTokens(room.creator);

  // Are we missing an access token, but have a refresh token to use?
  const canRefreshExpired = !accessToken && storedRefreshToken;

  // if lastRefresh is more than 30 minutes ago, refresh the tokens
  if (
    canRefreshExpired ||
    !room.lastRefreshedAt ||
    now - lastRefresh > 30 * 60 * 1000
  ) {
    // refresh tokens
    const accessToken = await refreshToken(room.creator);
    await pubClient.publish(
      PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED,
      JSON.stringify({ roomId, userId: room.creator, accessToken })
    );
    // update room.lastRefreshedAt
    await updateRoom(roomId, { lastRefreshedAt: Date.now().toString() });
    await delRoomKey(roomId, "details", "spotifyError");
  }
}
