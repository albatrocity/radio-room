import { MetadataSourceTrack } from "./MetadataSource"
import { Station } from "./Station"
import { MediaSourceType, MetadataSourceType } from "./TrackSource"

/**
 * Data submitted by a MediaSource job when it detects media playing.
 * The server will construct a full QueueItem from this data.
 */
export interface MediaData {
  /** The track metadata from the external service */
  track: MetadataSourceTrack

  /** Where the media is being streamed from */
  mediaSource: {
    type: MediaSourceType
    trackId: string
  }

  /** Optional: Where the metadata came from (if different from mediaSource) */
  metadataSource?: {
    type: MetadataSourceType
    trackId: string
  }

  /** Optional: Station metadata for radio streams */
  stationMeta?: Station
}

/**
 * Limited API provided to job handlers.
 * This keeps MediaSource adapters isolated from server internals.
 */
export interface JobApi {
  /**
   * Submit media data to the server.
   * The server will:
   * - Check if this is a new track (using Redis as source of truth)
   * - Construct a QueueItem
   * - Persist to Redis
   * - Update playlist/queue
   * - Emit appropriate events (TRACK_CHANGED, MEDIA_SOURCE_STATUS_CHANGED)
   */
  submitMediaData: (params: {
    roomId: string
    data?: MediaData
    error?: string
  }) => Promise<void>
}

