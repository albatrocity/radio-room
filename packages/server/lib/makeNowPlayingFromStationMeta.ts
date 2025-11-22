import { Station } from "@repo/types/Station"
import { QueueItem } from "@repo/types/Queue"
import { createHash } from "crypto"

function makeStationName(stationMeta?: Station) {
  return stationMeta?.title?.split("|")[0]?.trim() ?? "Unknown Station"
}

// Create a stable, deterministic ID from station metadata
// This ensures the same station broadcast always gets the same ID
function makeStableTrackId(stationMeta?: Station): string {
  const title = stationMeta?.title || "unknown"
  // Create a hash of the station title for a stable, unique ID
  const hash = createHash("md5").update(title).digest("hex")
  return `radio-${hash.substring(0, 22)}` // 22 chars to match Spotify ID length
}
function makeStationArtists(stationMeta?: Station): QueueItem["track"]["artists"] {
  return [
    {
      id: `artist-${Date.now()}`,
      title: stationMeta?.title?.split("|")[1]?.trim() ?? "Unknown Artist",
      urls: [],
    },
  ]
}
function makeStationAlbum(stationMeta?: Station): QueueItem["track"]["album"] {
  return {
    artists: [],
    images: [],
    id: `album-${Date.now()}`,
    label: "Unknown",
    releaseDate: "Unknown",
    releaseDatePrecision: "day",
    totalTracks: 0,
    urls: [],
    title: stationMeta?.title?.split("|")[2]?.trim() ?? "Unknown Album",
  }
}

export default async function makeNowPlayingFromStationMeta(
  stationMeta?: Station,
): Promise<QueueItem> {
  const trackTitle = makeStationName(stationMeta)
  return {
    title: trackTitle,
    addedAt: Date.now(),
    addedBy: undefined,
    addedDuring: "nowPlaying",
    playedAt: Date.now(),
    track: {
      title: trackTitle,
      album: makeStationAlbum(stationMeta),
      artists: makeStationArtists(stationMeta),
      duration: 0,
      id: makeStableTrackId(stationMeta), // Use stable hash-based ID
      discNumber: 0,
      explicit: false,
      images: [],
      popularity: 0,
      trackNumber: 0,
      urls: [],
    },
  }
}
