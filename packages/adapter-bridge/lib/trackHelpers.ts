import type { MetadataSourceTrack } from "@repo/types"

/** Minimal empty album used when a source has no album concept (YouTube). */
export function emptyAlbum(overrides?: Partial<MetadataSourceTrack["album"]>): MetadataSourceTrack["album"] {
  return {
    id: "",
    title: "",
    urls: [],
    artists: [],
    releaseDate: "",
    releaseDatePrecision: "year",
    totalTracks: 0,
    label: "",
    images: [],
    ...overrides,
  }
}

export function emptyArtist(
  id: string,
  title: string,
): MetadataSourceTrack["artists"][number] {
  return { id, title, urls: [] }
}
