import { SpotifyEntity } from "./SpotifyEntity"
import { SpotifyExternalUrls } from "./SpotifyExternalUrls"

export interface SpotifyPlaylist extends SpotifyEntity {
  id: string
  external_urls: SpotifyExternalUrls
  name: string
}
