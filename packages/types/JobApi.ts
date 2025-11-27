import { MetadataSourceTrack } from "./MetadataSource"
import { Station } from "./Station"
import { MediaSourceType, MetadataSourceType } from "./TrackSource"

/**
 * Standard submission from any MediaSource.
 *
 * MediaSources submit raw media info. The server handles:
 * - Deduplication (checking if track already playing)
 * - Enrichment via room's MetadataSource (if configured and needed)
 * - QueueItem construction
 * - Event emission
 *
 * If the MediaSource already provides rich data (e.g., Spotify is both
 * MediaSource and MetadataSource), it can include enrichedTrack to skip
 * server-side enrichment.
 */
export interface MediaSourceSubmission {
  /** Stable identifier for this media (used for deduplication) */
  trackId: string

  /** Type of media source */
  sourceType: MediaSourceType

  /** Raw title from the media source */
  title: string

  /** Raw artist (if available) */
  artist?: string

  /** Raw album (if available) */
  album?: string

  /**
   * Pre-enriched track data (optional).
   * If provided, the server will use this instead of calling MetadataSource.
   * Typically provided when MediaSource is also a MetadataSource (e.g., Spotify).
   */
  enrichedTrack?: MetadataSourceTrack

  /**
   * Metadata source info (required if enrichedTrack is provided).
   * Tells the server where the rich metadata came from.
   */
  metadataSource?: {
    type: MetadataSourceType
    trackId: string
  }

  /** Station metadata for radio streams */
  stationMeta?: Station
}

/**
 * @deprecated Use MediaSourceSubmission instead
 */
export interface MediaData {
  track: MetadataSourceTrack
  mediaSource: {
    type: MediaSourceType
    trackId: string
  }
  metadataSource?: {
    type: MetadataSourceType
    trackId: string
  }
  stationMeta?: Station
}

/**
 * Limited API provided to job handlers.
 * This keeps MediaSource adapters isolated from server internals.
 */
export interface JobApi {
  /**
   * Submit media data to the server.
   *
   * The server will:
   * - Check if this is a new track (using Redis as source of truth)
   * - Enrich with MetadataSource if needed (based on room config)
   * - Construct a QueueItem
   * - Persist to Redis
   * - Update playlist/queue
   * - Emit appropriate events (TRACK_CHANGED, MEDIA_SOURCE_STATUS_CHANGED)
   *
   * @param submission - Media data from the MediaSource
   * @param error - Optional error message (for error status emission)
   */
  submitMediaData: (params: {
    roomId: string
    submission?: MediaSourceSubmission
    error?: string
  }) => Promise<void>

  /**
   * Get the current track ID for a room.
   * Use this to check if a track has changed before submitting.
   * Returns null if no track is currently playing.
   */
  getCurrentTrackId: (roomId: string) => Promise<string | null>
}

