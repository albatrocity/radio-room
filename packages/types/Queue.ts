import { MetadataSourceTrack } from "./MetadataSource"
import { User } from "./User"
import { MediaSourceInfo, MetadataSourceInfo } from "./TrackSource"

export interface QueueItem {
  title: string
  track: MetadataSourceTrack

  // Separate sources with explicit types
  mediaSource: MediaSourceInfo // REQUIRED: Stable identity from streaming source
  metadataSource?: MetadataSourceInfo // Optional: Rich metadata ID for API calls (when enriched)

  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
}

export interface Queue {
  items: QueueItem[]
}
