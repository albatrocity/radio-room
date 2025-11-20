import { PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED } from "../../lib/constants";
import { delRoomKey, findRoom, updateRoom } from "../../operations/data";
import { getStoredUserSpotifyTokens } from "@repo/adapter-spotify/lib/operations/getStoredUserSpotifyTokens";
import { refreshSpotifyToken } from "@repo/adapter-spotify/lib/operations/refreshSpotifyToken";
import { AppContext } from "@repo/types";

export async function refreshSpotifyTokens(context: AppContext, roomId: string) {
  const room = await findRoom({ context, roomId });
  if (!room?.creator) {
    return;
  }
  const now = Date.now();
  const lastRefresh = parseInt(room.lastRefreshedAt);
  const tokens = await getStoredUserSpotifyTokens(room.creator);

  // Are we missing an access token, but have a refresh token to use?
  const canRefreshExpired = !tokens.accessToken && tokens.refreshToken;

  // if lastRefresh is more than 30 minutes ago, refresh the tokens
  if (
    canRefreshExpired ||
    !room.lastRefreshedAt ||
    now - lastRefresh > 30 * 60 * 1000
  ) {
    // refresh tokens
    const newAccessToken = await refreshSpotifyToken(room.creator);
    await context.redis.pubClient.publish(
      PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED,
      JSON.stringify({ roomId, userId: room.creator, accessToken: newAccessToken })
    );
    // update room.lastRefreshedAt
    await updateRoom({ context, roomId, data: { lastRefreshedAt: Date.now().toString() } });
    await delRoomKey({ context, roomId, key: "details", field: "spotifyError" });
  }
}
