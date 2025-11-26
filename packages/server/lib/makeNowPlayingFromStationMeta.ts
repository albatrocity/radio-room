import { Station, MetadataSourceTrack } from "@repo/types"
import { createHash } from "crypto"

function makeStationTrackTitle(stationMeta?: Station): string {
  return stationMeta?.title?.split("|")[0]?.trim() ?? "Unknown Station"
}

function makeStationArtistName(stationMeta?: Station): string {
  return stationMeta?.title?.split("|")[1]?.trim() ?? "Unknown Artist"
}

function makeStationAlbumTitle(stationMeta?: Station): string {
  return stationMeta?.title?.split("|")[2]?.trim() ?? "Unknown Album"
}

/**
 * Create a stable, deterministic ID from station metadata.
 * This ensures the same station broadcast always gets the same ID.
 */
export function makeStableTrackId(stationMeta?: Station): string {
  const title = stationMeta?.title || "unknown"
  // Create a hash of the station title for a stable, unique ID
  const hash = createHash("md5").update(title).digest("hex")
  return hash.substring(0, 22) // 22 chars for consistency
}

/**
 * Creates a MetadataSourceTrack from raw station metadata.
 * Used when metadata enrichment is not available or fails.
 */
export default function makeTrackFromStationMeta(stationMeta?: Station): MetadataSourceTrack {
  const trackTitle = makeStationTrackTitle(stationMeta)
  const trackId = makeStableTrackId(stationMeta)
  const artistName = makeStationArtistName(stationMeta)
  const albumTitle = makeStationAlbumTitle(stationMeta)

  return {
    id: trackId,
    title: trackTitle,
    urls: [],
    images: [],
    artists: [
      {
        id: `artist-${trackId}`,
        title: artistName,
        urls: [],
      },
    ],
    album: {
      id: `album-${trackId}`,
      title: albumTitle,
      artists: [],
      images: [],
      label: "Unknown",
      releaseDate: "Unknown",
      releaseDatePrecision: "day",
      totalTracks: 0,
      urls: [],
    },
    duration: 0,
    discNumber: 0,
    explicit: false,
    popularity: 0,
    trackNumber: 0,
  }
}

// Legacy alias for backward compatibility
export const makeNowPlayingFromStationMeta = makeTrackFromStationMeta
