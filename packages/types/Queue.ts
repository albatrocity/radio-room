import { MetadataSourceTrack } from "./MetadataSource"
import { User } from "./User"

export interface QueueItem {
  title: string
  track: MetadataSourceTrack
  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
}

export interface Queue {
  items: QueueItem[]
}
