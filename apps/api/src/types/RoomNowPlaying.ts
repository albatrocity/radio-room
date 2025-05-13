import { SpotifyAlbum } from "./SpotifyAlbum";
import { SpotifyArtist } from "./SpotifyArtist";
import { SpotifyTrack } from "./SpotifyTrack";

export type RoomNowPlaying = {
  name?: string;
  artists?: Partial<SpotifyArtist>[];
  album?: Partial<SpotifyAlbum>;
  type: "track";
  id?: SpotifyTrack["id"];
  uri?: SpotifyTrack["uri"];
  duration_ms?: SpotifyTrack["duration_ms"];
  explicit?: SpotifyTrack["explicit"];
  popularity?: SpotifyTrack["popularity"];
  preview_url?: SpotifyTrack["preview_url"];
  track_number?: SpotifyTrack["track_number"];
  disc_number?: SpotifyTrack["disc_number"];
  available_markets?: SpotifyTrack["available_markets"];
  is_local?: SpotifyTrack["is_local"];
};
