import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataSourceTrack,
  MetadataSourceUrl,
} from "@repo/types"
import { trackItemSchema } from "./schemas"

type SpotifyImage = { url: string; height: number | null; width: number | null }

function mapImages(images?: SpotifyImage[] | null): MetadataSourceUrl[] {
  if (!images?.length) return []
  return images.map((image) => ({
    type: "image" as const,
    url: image.url,
    id: `${image.width || 0}x${image.height || 0}`,
  }))
}

export function mapSpotifyBrowseArtist(artist: {
  id: string
  name: string
  images?: SpotifyImage[] | null
}): MetadataBrowseArtist {
  return {
    id: artist.id,
    title: artist.name,
    images: mapImages(artist.images),
  }
}

export function mapSpotifyBrowseAlbum(album: {
  id: string
  name: string
  artists?: Array<{ id: string; name: string }>
  release_date?: string
  total_tracks?: number
  images?: SpotifyImage[] | null
}): MetadataBrowseAlbum {
  const year = album.release_date?.split("-")[0]
  return {
    id: album.id,
    title: album.name,
    artists: (album.artists ?? []).map((a) => ({
      id: a.id,
      title: a.name,
      urls: [],
    })),
    year: year || undefined,
    trackCount: album.total_tracks,
    images: mapImages(album.images),
  }
}

/**
 * Build a MetadataSourceTrack from a simplified album track + parent album.
 * Spotify album track pages omit nested album / popularity.
 */
export function mapSpotifyAlbumTrack(
  track: {
    id: string
    name: string
    uri: string
    duration_ms: number
    explicit: boolean
    track_number: number
    disc_number: number
    artists: Array<{ id: string; name: string; uri: string }>
    external_urls?: { spotify?: string }
    preview_url?: string | null
  },
  album: {
    id: string
    name: string
    uri: string
    images: SpotifyImage[]
    artists: Array<{ id: string; name: string; uri: string }>
    release_date: string
    release_date_precision: "day" | "month" | "year"
    total_tracks: number
  },
): MetadataSourceTrack {
  return trackItemSchema.parse({
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    track_number: track.track_number,
    disc_number: track.disc_number,
    popularity: 0,
    preview_url: track.preview_url ?? null,
    artists: track.artists,
    external_urls: track.external_urls,
    album,
  })
}
