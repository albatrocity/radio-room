/**
 * Track ID utilities for handling different track ID formats across services
 */

export type TrackIdType = "spotify" | "radio" | "unknown"

export interface TrackIdInfo {
  type: TrackIdType
  id: string
  isServiceId: boolean // Can this ID be used with a music service API?
}

/**
 * Parse a track ID to determine its type and characteristics
 */
export function parseTrackId(id: string): TrackIdInfo {
  if (!id) {
    return { type: "unknown", id, isServiceId: false }
  }

  // Radio station synthetic IDs
  if (id.startsWith("radio-")) {
    return { type: "radio", id, isServiceId: false }
  }

  // Spotify IDs are 22-character base62 strings
  if (/^[a-zA-Z0-9]{22}$/.test(id)) {
    return { type: "spotify", id, isServiceId: true }
  }

  return { type: "unknown", id, isServiceId: false }
}

/**
 * Check if a track ID is a valid Spotify ID
 */
export function isSpotifyTrackId(id: string): boolean {
  return parseTrackId(id).type === "spotify"
}

/**
 * Filter a list of track IDs to only include valid Spotify IDs
 */
export function filterSpotifyTrackIds(ids: string[]): string[] {
  return ids.filter(isSpotifyTrackId)
}

/**
 * Check if a track ID is a synthetic (non-service) ID
 */
export function isSyntheticTrackId(id: string): boolean {
  return !parseTrackId(id).isServiceId
}

