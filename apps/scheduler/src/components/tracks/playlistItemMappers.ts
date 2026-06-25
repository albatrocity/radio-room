import type { MetadataSourceTrack } from "@repo/types/MetadataSource"
import type { QueueItem } from "@repo/types/Queue"
import {
  metadataTrackAlbumLine,
  metadataTrackArtistLine,
  metadataTrackCoverUrl,
} from "./metadataTrackDisplay"
import { queueItemAlbumLine, queueItemArtistLine, queueItemCoverUrl } from "./queueItemDisplay"
import type { PlaylistItemLines } from "./PlaylistItem"

export function playlistItemFromQueueItem(item: QueueItem): PlaylistItemLines {
  return {
    title: item.title || item.track?.title || "Untitled",
    artistLine: queueItemArtistLine(item),
    albumLine: queueItemAlbumLine(item),
    coverUrl: queueItemCoverUrl(item),
  }
}

export function playlistItemFromMetadataTrack(track: MetadataSourceTrack): PlaylistItemLines {
  return {
    title: track.title?.trim() || "Untitled",
    artistLine: metadataTrackArtistLine(track),
    albumLine: metadataTrackAlbumLine(track),
    coverUrl: metadataTrackCoverUrl(track),
  }
}
