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

// Contains both the source info and the full track data for a metadata source
export interface MetadataSourceTrackData {
  source: MetadataSourceInfo
  track: MetadataSourceTrack
}

export interface QueueItem {
  title: string
  track: MetadataSourceTrack // Default/primary track data for backward compatibility

  // Separate sources with explicit types
  mediaSource: MediaSourceInfo // REQUIRED: Stable identity from streaming source
  metadataSource?: MetadataSourceInfo // Optional: Primary metadata source ID for API calls (when enriched)

  // Multiple metadata sources - keyed by source type (spotify, tidal, etc.)
  metadataSources?: Partial<Record<MetadataSourceType, MetadataSourceTrackData>>

  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined

  // Plugin-augmented metadata (e.g., skip data from playlist-democracy plugin)
  pluginData?: Record<string, any>
}

/**
 * Helper to get the preferred track data from a QueueItem based on user preference
 * Falls back to the default track if the preferred source is not available
 */
export function getPreferredTrack(
  item: QueueItem,
  preferredSource?: MetadataSourceType,
): MetadataSourceTrack {
  if (preferredSource && item.metadataSources?.[preferredSource]) {
    return item.metadataSources[preferredSource]!.track
  }
  return item.track
}

/**
 * Helper to get the metadata source info for a preferred source
 * Falls back to the primary metadataSource if preferred is not available
 */
export function getPreferredMetadataSource(
  item: QueueItem,
  preferredSource?: MetadataSourceType,
): MetadataSourceInfo | undefined {
  if (preferredSource && item.metadataSources?.[preferredSource]) {
    return item.metadataSources[preferredSource]!.source
  }
  return item.metadataSource
}
