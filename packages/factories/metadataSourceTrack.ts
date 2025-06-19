import { Factory } from "fishery"

import { MetadataSourceTrack } from "@repo/types"

export const metadataSourceTrackFactory = Factory.define<MetadataSourceTrack>(({ sequence }) => ({
  id: "track-id",
  title: "Track Title",
  urls: [],
  artists: [],
  album: {
    id: "album-id",
    title: "Album Title",
    urls: [],
    artists: [],
    releaseDate: "2020-01-01",
    releaseDatePrecision: "day",
    totalTracks: 1,
    label: "Label",
    images: [],
  },
  duration: 0,
  explicit: false,
  trackNumber: 1,
  discNumber: 1,
  popularity: 0,
  images: [],
}))
