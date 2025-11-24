/**
 * Track source type definitions for separating MediaSource and MetadataSource identities
 */

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

