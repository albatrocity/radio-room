import type { MetadataSourceType, QueueItem } from "@repo/types"
import { getPreferredTrack } from "../types/Queue"
import type { Room } from "../types/Room"
import { hasListenableStream } from "./roomTypeHelpers"

type LobbyArtworkRoom = Pick<Room, "type" | "fetchMeta"> & {
  artwork?: string | null
  /** Segment image, or room artwork when the segment has none. */
  streamingArtwork?: string | null
  nowPlaying?: QueueItem | null
}

function nonempty(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Image masked into the home-page logo.
 *
 * Streaming mode (track detection off on a radio or live room) uses the active
 * segment image, then room artwork — the same cover Now Playing already shows.
 * Otherwise the logo uses the current track's album art.
 */
export function lobbyLogoArtworkUrl(
  room: LobbyArtworkRoom | null | undefined,
  preferredSource?: MetadataSourceType,
): string | undefined {
  if (!room) return undefined
  if (room.fetchMeta === false && hasListenableStream(room)) {
    return nonempty(room.streamingArtwork) ?? nonempty(room.artwork)
  }
  if (!room.nowPlaying) return undefined
  const track = getPreferredTrack(room.nowPlaying, preferredSource)
  return track.album?.images?.find((img) => img.type === "image" && img.url)?.url
}
