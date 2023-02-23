import { SpotifyAlbum } from "./SpotifyAlbum"
import { SpotifyArtist } from "./SpotifyArtist"
import { SpotifyEntity } from "./SpotifyEntity"

export interface SpotifyTrack extends SpotifyEntity {
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  available_markets: string[]
  disc_number: number
  duration_ms: number
  explicit: boolean
  is_local: boolean
  name: string
  popularity: number
  preview_url: string
  track_number: number
  type: "track"
}
