import { getSpotifyApiForRoom } from "./getSpotifyApi";

async function skipSpotifyTrack(roomId: string) {
  try {
    const spotify = await getSpotifyApiForRoom(roomId);
    const { body } = await spotify.skipToNext();
    return body;
  } catch (e) {
    console.error(e);
    console.error("Skip track failed");
    return {};
  }
}

export default skipSpotifyTrack;
