import { SpotifyArtist } from "./SpotifyArtist";
import { SpotifyEntity } from "./SpotifyEntity";
import { SpotifyExternalUrls } from "./SpotifyExternalUrls";
import { SpotifyImage } from "./SpotifyImage";

export interface SpotifyAlbum extends SpotifyEntity {
  album_type: "compilation" | "single" | "album";
  artists: SpotifyArtist[];
  available_markets?: string[] | undefined;
  external_urls: SpotifyExternalUrls;
  images: SpotifyImage[];
  name: string;
  release_date: string;
  release_date_precision: "day" | "month" | "year";
  total_tracks: number;
  type: "album";
}
