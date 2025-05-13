import { PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED } from "../../lib/constants";
import { pubClient } from "../../lib/redisClients";
import { getSpotifyApiForRoom } from "./getSpotifyApi";

async function resumeSpotify(roomId: string) {
  try {
    const spotify = await getSpotifyApiForRoom(roomId);
    const {
      body: { is_playing },
    } = await spotify.getMyCurrentPlaybackState();
    if (!is_playing) {
      await spotify.play();
      pubClient.publish(
        PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED,
        JSON.stringify({
          isPlaying: true,
          roomId,
        })
      );
    }
  } catch (e) {
    console.error(e);
    console.error("Resume failed");
    return {};
  }
}

export default resumeSpotify;
