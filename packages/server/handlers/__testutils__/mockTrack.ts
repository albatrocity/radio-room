// Minimal valid MetadataSourceTrack for tests
export const mockTrack = {
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
} as const
