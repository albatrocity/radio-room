import { Station } from "@repo/types/Station"
import { QueueItem } from "@repo/types/Queue"

function makeStationName(stationMeta?: Station) {
  return stationMeta?.title?.split("|")[0]?.trim() ?? "Unknown Station"
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
  return {
    addedAt: Date.now(),
    addedBy: undefined,
    addedDuring: "nowPlaying",
    playedAt: Date.now(),
    track: {
      title: makeStationName(stationMeta),
      album: makeStationAlbum(stationMeta),
      artists: makeStationArtists(stationMeta),
      duration: 0,
      id: `track-${Date.now()}`,
      discNumber: 0,
      explicit: false,
      images: [],
      popularity: 0,
      trackNumber: 0,
      urls: [],
    },
  }
}
