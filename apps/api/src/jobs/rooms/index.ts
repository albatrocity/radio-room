import { refreshSpotifyTokens } from "./refreshSpotifyTokens";
import { pubClient } from "../../lib/redisClients";
import { cleanupRoom } from "./cleanupRooms";

export default async function () {
  try {
    const roomIds = await pubClient.sMembers("rooms");
    await Promise.all(
      roomIds.map(async (id) => {
        await refreshSpotifyTokens(id);
        return cleanupRoom(id);
      })
    );
  } catch (e) {
    console.error(e);
  }
}
