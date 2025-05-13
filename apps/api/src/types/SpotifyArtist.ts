import { SpotifyEntity } from "./SpotifyEntity";
import { SpotifyExternalUrls } from "./SpotifyExternalUrls";

export interface SpotifyArtist extends SpotifyEntity {
  external_urls: SpotifyExternalUrls;
  name: string;
  type: "artist";
}
