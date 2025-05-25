import { SpotifyEntity } from "../../types/SpotifyEntity";
import { getSpotifyApiForUser } from "./getSpotifyApi";

async function createAndPopulateSpotifyPlaylist(
  name: string,
  uris: SpotifyEntity["uri"][],
  userId?: string
) {
  const date_time = new Date();
  const date = date_time.getDate();
  const month = date_time.getMonth() + 1;
  const year = date_time.getFullYear();

  const description = `Group Playlist ${month}-${date}-${year}`;
  const spotifyApi = await getSpotifyApiForUser(userId);
  const { body } = await spotifyApi.createPlaylist(name, {
    description: description,
    public: true,
  });

  await spotifyApi.addTracksToPlaylist(body.id, [...uris]);

  return body;
}

export default createAndPopulateSpotifyPlaylist;
