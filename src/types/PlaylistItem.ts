import { SpotifyImage } from "./SpotifyImage"
import { User } from "./User"

interface SpotifyData {
  mbid: string
  releaseDate: string
  name: string
  artwork: string
  artworkImages: SpotifyImage[]
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
}
