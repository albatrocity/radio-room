import { z } from "zod"
import { AdapterAuthentication, AdapterConfig } from "./Adapter"
import { JobRegistration } from "./JobRegistration"
import type { SimpleCache } from "./SimpleCache"

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

/**
 * A track tagged with the metadata source that returned it (`"spotify"`,
 * `"local"`, …). Search and browse merge several sources into one list, and the
 * tag drives badges, preview keys, and dedupe downstream.
 *
 * `source` is optional because a row can reach the client untagged — the schema
 * itself has no such field. Use {@link TaggedMetadataSourceTrack} where the
 * producer always applies the tag.
 */
export type MetadataSourceTrackWithSource = MetadataSourceTrack & { source?: string }

/** A track whose producer guarantees the source tag (e.g. server operations). */
export type TaggedMetadataSourceTrack = MetadataSourceTrack & { source: string }

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
    /** Optional TTL cache for adapters that opt into search-result caching. */
    cache?: SimpleCache
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

// =============================================================================
// MetadataSource Browse (optional catalog navigation)
// =============================================================================

export const metadataBrowseArtistSchema = z.object({
  id: z.string(),
  title: z.string(),
  albumCount: z.number().optional(),
  images: z.array(metadataSourceUrlSchema).optional(),
})
export type MetadataBrowseArtist = z.infer<typeof metadataBrowseArtistSchema>

export const metadataBrowseAlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.array(metadataSourceExternalResourceSchema),
  year: z.string().optional(),
  trackCount: z.number().optional(),
  images: z.array(metadataSourceUrlSchema).optional(),
})
export type MetadataBrowseAlbum = z.infer<typeof metadataBrowseAlbumSchema>

export type MetadataListArtistsParams = {
  query?: string
  offset?: number
  limit?: number
  /**
   * When set, Local/bridge catalog ops restrict to the union of these Navidrome
   * playlist ids (invisible shelf grants). Omitted = full library (ADR 0098).
   */
  playlistIds?: string[]
  /**
   * When set (alone or with playlistIds), Local/bridge catalog ops also include
   * tracks on these Navidrome album ids. Empty playlistIds + empty albumIds =
   * full library; either non-empty = restricted union.
   */
  albumIds?: string[]
}

export type MetadataListArtistsResult = {
  items: MetadataBrowseArtist[]
  total?: number
}

/** Same paging/filter shape as listArtists; reused for album root listing (ADR 0090). */
export type MetadataListAlbumsParams = MetadataListArtistsParams

export type MetadataListAlbumsResult = {
  items: MetadataBrowseAlbum[]
  total?: number
}

export type MetadataGetArtistResult = {
  artist: MetadataBrowseArtist
  albums: MetadataBrowseAlbum[]
}

export type MetadataGetAlbumResult = {
  album: MetadataBrowseAlbum
  tracks: MetadataSourceTrack[]
}

/** How Browse UI should enter the catalog for this source (ADR 0090). */
export type MetadataBrowseEntryMode = "index" | "search"

export type MetadataBrowseCapabilities = {
  entryMode: MetadataBrowseEntryMode
  /** True when listAlbums is implemented (Artists | Albums root). */
  albumSearch: boolean
}

import type { ArtworkFrame } from "./Inventory"

/**
 * A held Physical Media item in Add to Queue. `mediaKey` is the inventory
 * shortId (never a Navidrome playlist id — ADR 0099).
 */
export type PhysicalMediaItem = {
  mediaKey: string
  name: string
  icon?: string
  /** Cover artwork URL, preferred over `icon` when present. Row-sized (~384px). */
  imageUrl?: string
  /** Feature-sized (~1200px) cover; omitted when the record has no large variant. */
  imageUrlLarge?: string
  /** Physical Media presentation overlay when `imageUrl` is present (ADR 0099). */
  artworkFrame?: ArtworkFrame
}

/**
 * Server-resolved Physical Media source for browse/preview (ADR 0099 / 0109).
 * Clients never supply playlist or album ids — only `mediaKey`.
 */
export type ResolvedPhysicalMediaItem = {
  item: PhysicalMediaItem
} & (
  | { kind: "playlist"; playlistId: string }
  | { kind: "album"; albumId: string }
)

export type MetadataCatalogFilterOptions = {
  playlistIds?: string[]
  albumIds?: string[]
}

export interface MetadataSourceApi {
  search: (
    query: string,
    options?: MetadataCatalogFilterOptions,
  ) => Promise<MetadataSourceTrack[]>
  searchByParams: (params: MetadataSourceSearchParameters) => Promise<MetadataSourceTrack[]>
  findById: (
    id: string,
    options?: MetadataCatalogFilterOptions,
  ) => Promise<MetadataSourceTrack | null>
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
  /** Optional catalog browse: Artists → Albums → Tracks (ADR 0089 / 0090). */
  listArtists?: (params?: MetadataListArtistsParams) => Promise<MetadataListArtistsResult>
  listAlbums?: (params?: MetadataListAlbumsParams) => Promise<MetadataListAlbumsResult>
  getArtist?: (
    artistId: string,
    options?: MetadataCatalogFilterOptions,
  ) => Promise<MetadataGetArtistResult | null>
  getAlbum?: (
    albumId: string,
    options?: MetadataCatalogFilterOptions,
  ) => Promise<MetadataGetAlbumResult | null>
  getBrowseCapabilities?: () => MetadataBrowseCapabilities
}

export interface MetadataSourceError {
  status: number
  message: string
  reason?: string
}
