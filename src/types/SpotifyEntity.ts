import { SpotifyExternalUrls } from "./SpotifyExternalUrls"

export interface SpotifyEntity {
  id: string
  href: string
  type: "artist" | "track" | "album"
  uri: string
  external_urls?: SpotifyExternalUrls
}
