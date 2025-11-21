import { AdapterAuthentication, AdapterConfig } from "./Adapter"
import { JobRegistration } from "./JobRegistration"

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

export type MetadataSourceLifecycleCallbacks = {
  onRegistered: (params: { name: string }) => void
  onAuthenticationCompleted: () => void
  onAuthenticationFailed: (error: Error) => void
  onSearchResults: (data: MetadataSourceTrack) => void
  onError: (error: Error) => void
}

export type MetadataSourceAdapterConfig = MetadataSourceLifecycleCallbacks &
  AdapterConfig & {
    name: string
    url: string
    registerJob: (job: JobRegistration) => Promise<JobRegistration>
  }

export type MetadataSource = {
  name: string
  authentication: AdapterAuthentication
  api: MetadataSourceApi
}

export interface MetadataSourceAdapter {
  register: (config: MetadataSourceAdapterConfig) => Promise<MetadataSource>
}

export type MetadataSourceSearchParameters = Pick<
  MetadataSourceTrack,
  "title" | "artists" | "album" | "id"
>

export interface MetadataSourceApi {
  search: (query: string) => Promise<MetadataSourceTrack[]>
  searchByParams: (params: MetadataSourceSearchParameters) => Promise<MetadataSourceTrack[]>
  findById: (id: string) => Promise<MetadataSourceTrack | null>
  createPlaylist?: (params: {
    title: string
    trackIds: MetadataSourceTrack["id"][]
    userId: string
  }) => Promise<{
    title: string
    trackIds: MetadataSourceTrack["id"][]
    id: string
    url?: string
  }>
  // Library management methods (optional)
  getSavedTracks?: () => Promise<MetadataSourceTrack[]>
  checkSavedTracks?: (trackIds: string[]) => Promise<boolean[]>
  addToLibrary?: (trackIds: string[]) => Promise<void>
  removeFromLibrary?: (trackIds: string[]) => Promise<void>
}

export interface MetadataSourceError {
  status: number
  message: string
  reason?: string
}
