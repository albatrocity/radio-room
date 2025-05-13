import { SpotifyEntity } from "../../types/SpotifyEntity";
import { getSpotifyApiForUser } from "./getSpotifyApi";

async function likeSpotifyTrack(uri: SpotifyEntity["id"], userId: string) {
  try {
    const spotify = await getSpotifyApiForUser(userId);
    const parsedUri = uri.replace("spotify:track:", "");
    const { body } = await spotify.addToMySavedTracks([parsedUri]);
    return body;
  } catch (e) {
    console.error(e);
    console.error("Like track failed");
    return {};
  }
}

export default likeSpotifyTrack;
