import { SpotifyAlbum } from "./SpotifyAlbum"
import { SpotifyExternalUrls } from "./SpotifyExternalUrls"
import { SpotifyImage } from "./SpotifyImage"
import { User } from "./User"

interface SpotifyData {
  mbid: string
  releaseDate: string
  name: string
  artwork: string
  artworkImages: SpotifyImage[]
  external_urls: SpotifyExternalUrls
  album: SpotifyAlbum
  url: string
  uri: string
}

export interface PlaylistItem {
  track: string
  album: string
  timestamp: number | Date
  artist: string
  dj: User
  spotifyData?: SpotifyData
  id?: string
}
