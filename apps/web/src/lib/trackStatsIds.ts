import type { QueueItem } from "@repo/types/Queue"
import type { TrackStatsIdentityQuery } from "@repo/types"
import type { MetadataSourceType } from "@repo/types"

function extractServiceTrackId(
  item: QueueItem,
  service: Extract<MetadataSourceType, "spotify" | "tidal">,
): string | undefined {
  const bundle = item.metadataSources?.[service]
  if (bundle?.track?.id) {
    return bundle.track.id
  }
  if (item.metadataSource?.type === service && item.track?.id) {
    return item.track.id
  }
  return undefined
}

export function trackStatsIdsFromQueueItem(item: QueueItem): TrackStatsIdentityQuery | null {
  const type = item.mediaSource?.type
  const trackId = item.mediaSource?.trackId?.trim()
  if (!type || !trackId) {
    return null
  }

  const spotifyTrackId = extractServiceTrackId(item, "spotify")
  const tidalTrackId = extractServiceTrackId(item, "tidal")

  return {
    mediaSourceType: type,
    mediaSourceTrackId: trackId,
    ...(spotifyTrackId ? { spotifyTrackId } : {}),
    ...(tidalTrackId ? { tidalTrackId } : {}),
  }
}
