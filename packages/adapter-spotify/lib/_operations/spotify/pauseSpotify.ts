import { PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED } from "../../lib/constants";
import { pubClient } from "../../lib/redisClients";
import { getSpotifyApiForRoom } from "../../operations/spotify/getSpotifyApi";

async function pauseSpotify(roomId: string) {
  try {
    const spotify = await getSpotifyApiForRoom(roomId);
    const {
      body: { is_playing },
    } = await spotify.getMyCurrentPlaybackState();
    if (is_playing) {
      await spotify.pause();
      pubClient.publish(
        PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED,
        JSON.stringify({
          isPlaying: false,
          roomId,
        })
      );
    }
  } catch (e) {
    console.error(e);
    console.error("Pause failed");
    return {};
  }
}

export default pauseSpotify;
