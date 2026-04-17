import type {
  MediaSourceSubmission,
  MetadataSourceTrack,
  MetadataSourceTrackData,
  QueueItem,
} from "@repo/types"
import type { MetadataSourceType } from "@repo/types/TrackSource"

export type FindQueuedTrackParams = {
  queue: QueueItem[]
  submission: MediaSourceSubmission
  track: MetadataSourceTrack
  metadataSources?: Record<MetadataSourceType, MetadataSourceTrackData | undefined>
  isRadioRoom?: boolean
}

/**
 * Find a queued track that matches the current submission.
 *
 * Matching strategies:
 * 1. Exact match by mediaSource type + trackId (jukebox mode)
 * 2. Primary track.id vs submission.trackId when not radio (enrichment may diverge mediaSource ids)
 * 3. Match by metadataSource track IDs (radio — queued Spotify, detected via stream)
 * 4. Fuzzy title/artist (fallback for radio rooms only)
 */
export function findQueuedTrack({
  queue,
  submission,
  track,
  metadataSources,
  isRadioRoom,
}: FindQueuedTrackParams): QueueItem | undefined {
  if (!queue?.length) return undefined

  // Strategy 1: Exact match by mediaSource (works for jukebox mode)
  let match = queue.find(
    (item) =>
      item.mediaSource.type === submission.sourceType &&
      item.mediaSource.trackId === submission.trackId,
  )
  if (match) return match

  // Strategy 2: Primary catalog track id matches submission (jukebox / hybrid without stream match yet)
  if (!isRadioRoom) {
    match = queue.find((item) => item.track.id === submission.trackId)
    if (match) return match
  }

  // Strategy 3: Match using metadataSource track IDs
  if (metadataSources) {
    for (const [sourceType, sourceData] of Object.entries(metadataSources)) {
      if (!sourceData?.source?.trackId) continue

      match = queue.find(
        (item) =>
          item.mediaSource.type === sourceType &&
          item.mediaSource.trackId === sourceData.source.trackId,
      )
      if (match) return match
    }
  }

  // Strategy 4: Fuzzy match by title/artist (fallback for radio rooms only)
  if (isRadioRoom) {
    const submissionTitle = track.title.toLowerCase().trim()
    const submissionArtist = track.artists?.[0]?.title?.toLowerCase().trim() || ""

    match = queue.find((item) => {
      const queuedTitle = item.track.title.toLowerCase().trim()
      const queuedArtist = item.track.artists?.[0]?.title?.toLowerCase().trim() || ""

      const titleMatch =
        queuedTitle.includes(submissionTitle) ||
        submissionTitle.includes(queuedTitle) ||
        queuedTitle === submissionTitle
      const artistMatch =
        queuedArtist.includes(submissionArtist) ||
        submissionArtist.includes(queuedArtist) ||
        queuedArtist === submissionArtist

      return titleMatch && artistMatch
    })
    if (match) return match
  }

  return undefined
}
