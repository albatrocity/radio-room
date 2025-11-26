import { z } from "zod"
import { AdapterAuthentication, AdapterConfig } from "./Adapter"
import { JobRegistration } from "./JobRegistration"

// =============================================================================
// MetadataSource URL Schema & Type
// =============================================================================

export const metadataSourceUrlSchema = z.object({
  type: z.enum(["resource", "image"]),
  url: z.string(),
  id: z.string(),
})
export type MetadataSourceUrl = z.infer<typeof metadataSourceUrlSchema>

// =============================================================================
// MetadataSource External Resource Schema & Type
// =============================================================================

export const metadataSourceExternalResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  urls: z.array(metadataSourceUrlSchema),
})
export type MetadataSourceExternalResource = z.infer<typeof metadataSourceExternalResourceSchema>

// =============================================================================
// MetadataSource Album Schema & Type
// =============================================================================

export const metadataSourceAlbumSchema = metadataSourceExternalResourceSchema.extend({
  artists: z.array(metadataSourceExternalResourceSchema),
  releaseDate: z.string(),
  releaseDatePrecision: z.enum(["day", "month", "year"]),
  totalTracks: z.number(),
  label: z.string(),
  images: z.array(metadataSourceUrlSchema),
})
export type MetadataSourceAlbum = z.infer<typeof metadataSourceAlbumSchema>

// =============================================================================
// MetadataSource Track Schema & Type
// =============================================================================

export const metadataSourceTrackSchema = metadataSourceExternalResourceSchema.extend({
  artists: z.array(metadataSourceExternalResourceSchema),
  album: metadataSourceAlbumSchema,
  duration: z.number(),
  explicit: z.boolean(),
  trackNumber: z.number(),
  discNumber: z.number(),
  popularity: z.number(),
  images: z.array(metadataSourceUrlSchema),
})
export type MetadataSourceTrack = z.infer<typeof metadataSourceTrackSchema>

// =============================================================================
// MetadataSource Lifecycle Callbacks (not schema-based)
// =============================================================================

export type MetadataSourceLifecycleCallbacks = {
  onRegistered?: (params: { name: string }) => void
  onAuthenticationCompleted?: () => void
  onAuthenticationFailed?: (error: Error) => void
  onSearchResults?: (data: MetadataSourceTrack) => void
  onError?: (error: Error) => void
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
