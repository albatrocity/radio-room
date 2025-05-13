import { SpotifyTrack } from "./SpotifyTrack";
import { Track } from "./Track";
import { User } from "./User";

export type PlaylistTrack = {
  text: string;
  spotifyData: Partial<SpotifyTrack> | null;
  timestamp: number;
  dj?: User | null;
} & Pick<Track, "album" | "artist" | "track">;
