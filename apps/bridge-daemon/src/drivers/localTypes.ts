/** Shared Navidrome / OpenSubsonic shapes used by local browse + tags. */

export type NavidromeSong = {
  id?: string
  title?: string
  artist?: string
  artistId?: string
  album?: string
  albumId?: string
  path?: string
  duration?: number
  track?: number
  discNumber?: number
  coverArt?: string
  /** OpenSubsonic: comment tag (may be a lone URL). */
  comment?: string
  /** OpenSubsonic: MusicBrainz recording id. */
  musicBrainzId?: string
}

export type NavidromeArtist = {
  id?: string
  name?: string
  albumCount?: number
  coverArt?: string
}

export type NavidromeAlbum = {
  id?: string
  name?: string
  artist?: string
  artistId?: string
  year?: number
  songCount?: number
  coverArt?: string
  /** Operator star rating (1–5) when set in Navidrome. */
  userRating?: number
}

export type CoverArtUrlFn = (coverArtId: string) => string
