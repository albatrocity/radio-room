import { User } from "./User"

export type MetadataSourceUrl = {
  type: "resource" | "image"
  url: string
  id: string
}

export type MetadataSourceExternalResource = {
  id: string
  title: string
  urls: MetadataSourceUrl[]
}

export interface MetadataSourceAlbum extends MetadataSourceExternalResource {
  artists: MetadataSourceExternalResource[]
  releaseDate: string
  releaseDatePrecision: "day" | "month" | "year"
  totalTracks: number
  label: string
  images: MetadataSourceUrl[]
}

export interface MetadataSourceTrack extends MetadataSourceExternalResource {
  artists: MetadataSourceExternalResource[]
  album: MetadataSourceAlbum
  duration: number
  explicit: boolean
  trackNumber: number
  discNumber: number
  popularity: number
  images: MetadataSourceUrl[]
}

// Source type unions
export type MediaSourceType = "spotify" | "shoutcast" | "applemusic"
export type MetadataSourceType = "spotify" | "tidal" | "applemusic"

// Source objects with explicit typing
export interface MediaSourceInfo {
  type: MediaSourceType
  trackId: string
}

export interface MetadataSourceInfo {
  type: MetadataSourceType
  trackId: string
}

export interface QueueItem {
  title: string
  track: MetadataSourceTrack
  
  // Separate sources with explicit types
  mediaSource: MediaSourceInfo        // REQUIRED: Stable identity from streaming source
  metadataSource?: MetadataSourceInfo // Optional: Rich metadata ID for API calls (when enriched)
  
  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
  
  // Plugin-augmented metadata (e.g., skip data from playlist-democracy plugin)
  pluginData?: Record<string, any>
}

