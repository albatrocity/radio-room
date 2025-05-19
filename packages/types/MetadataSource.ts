export type MetadataSourceUrl = {
  type: "resource" | "image"
  url: string
  id: string
}

export type MetadataSourceExternalResource = {
  id: string
  title: string
  urls: MetadataSourceUrl[]
}

export interface MetadataSourceAlbum extends MetadataSourceExternalResource {
  artists: MetadataSourceExternalResource[]
  releaseDate: string
  releaseDatePrecision: "day" | "month" | "year"
  totalTracks: number
  label: string
  images: MetadataSourceUrl[]
}

export interface MetadataSourceTrack extends MetadataSourceExternalResource {
  artists: MetadataSourceExternalResource[]
  album: MetadataSourceAlbum
  duration: number
  explicit: boolean
  trackNumber: number
  discNumber: number
  popularity: number
  images: MetadataSourceUrl[]
}
