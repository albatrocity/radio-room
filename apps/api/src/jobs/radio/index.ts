import { communicateNowPlaying } from "./nowPlaying";
import { pubClient } from "../../lib/redisClients";

export default async function () {
  try {
    const roomIds = await pubClient.sMembers("rooms");
    await Promise.all(roomIds.map((id) => communicateNowPlaying(id)));
  } catch (e) {
    console.error(e);
  }
}
