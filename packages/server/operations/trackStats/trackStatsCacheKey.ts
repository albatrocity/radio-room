import type { TrackStatsIdentityQuery } from "@repo/types"

const TRACK_STATS_CACHE_PREFIX = "track-stats:v1"

export const TRACK_STATS_TTL_SECONDS = 86_400

export function trackStatsCacheKey(identity: TrackStatsIdentityQuery): string {
  const spotify = identity.spotifyTrackId ?? "-"
  const tidal = identity.tidalTrackId ?? "-"
  return `${TRACK_STATS_CACHE_PREFIX}:${identity.mediaSourceType}:${encodeURIComponent(identity.mediaSourceTrackId)}:${encodeURIComponent(spotify)}:${encodeURIComponent(tidal)}`
}
