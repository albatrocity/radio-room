import { SpotifyArtist } from "./SpotifyArtist"
import { SpotifyEntity } from "./SpotifyEntity"
import { SpotifyImage } from "./SpotifyImage"

export interface SpotifyAlbum extends SpotifyEntity {
  album_type: "compilation" | "single" | "album"
  artists: SpotifyArtist[]
  available_markets: string[]
  images: SpotifyImage[]
  name: string
  release_date: string
  release_date_precision: "day" | "month"
  total_tracks: number
  type: "album"
}
