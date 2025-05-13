export interface SpotifyEntity {
  id: string;
  href: string;
  type: "artist" | "track" | "album";
  uri: string;
}
