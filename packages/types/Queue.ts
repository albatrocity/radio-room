import { MetadataSourceTrack } from "./MetadataSource"

interface QueueItem {
  track: MetadataSourceTrack
  addedAt: number
  addedBy: string | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
}

export interface Queue {
  items: QueueItem[]
}
