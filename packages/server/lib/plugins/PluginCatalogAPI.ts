import type {
  AppContext,
  CatalogPluginAPI,
  LibraryAlbumRow,
  LocalPlaylistArtwork,
  MetadataSourceAccessAction,
  MetadataSourceTrack,
  PluginCatalogTrack,
} from "@repo/types"
import { PluginCapability } from "./PluginCapability"

function parseDataUri(dataUri: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUri)
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], base64Data: match[2] }
}

const LOCAL_COVER_STORE_BATCH = 8

const PLUGIN_SEARCH_DEFAULT_LIMIT = 10
const PLUGIN_SEARCH_MAX_LIMIT = 25

function toPluginCatalogTrack(item: unknown): PluginCatalogTrack | null {
  if (!item || typeof item !== "object") return null
  const raw = item as {
    id?: unknown
    title?: unknown
    artists?: Array<{ title?: unknown }>
    duration?: unknown
    source?: unknown
  }
  if (typeof raw.id !== "string" || typeof raw.source !== "string") return null
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    artists: Array.isArray(raw.artists)
      ? raw.artists.flatMap((a) => (typeof a?.title === "string" ? [a.title] : []))
      : [],
    durationMs: typeof raw.duration === "number" ? raw.duration : null,
    source: raw.source,
  }
}

async function storeCoverVariantToS3(params: {
  roomId: string
  identityHash: string
  dataUri: string
  variant: "sm" | "lg"
  context: AppContext
}): Promise<string | undefined> {
  const parsed = parseDataUri(params.dataUri)
  if (!parsed) return undefined
  try {
    const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
    const { getCoverPointer, ensureCoverObject } = await import("../../services/MediaObjectCache")
    const libraryId = await resolveMediaLibraryId({
      context: params.context,
      roomId: params.roomId,
    })
    const existing = await getCoverPointer({
      context: params.context,
      libraryId,
      identityHash: params.identityHash,
      variant: params.variant,
    })
    if (existing && "url" in existing) return existing.url
    if (existing && "none" in existing && existing.none) return undefined

    const result = await ensureCoverObject({
      context: params.context,
      libraryId,
      identityHash: params.identityHash,
      variant: params.variant,
      base64Data: parsed.base64Data,
      mimeType: parsed.mimeType,
    })
    return result.url
  } catch (e) {
    console.warn("[PluginAPI] storeCoverVariantToS3 failed, falling back to Redis:", e)
    // Emergency fallback so a show is not blank when S3/IAM/CDN is misconfigured.
    try {
      const { createHash } = await import("node:crypto")
      const { storeImage } = await import("../../operations/data")
      const hash = createHash("md5").update(parsed.base64Data).digest("hex").slice(0, 12)
      const imageId = `fallback-${params.variant}-${hash}`
      const stored = await storeImage({
        roomId: params.roomId,
        imageId,
        base64Data: parsed.base64Data,
        mimeType: parsed.mimeType,
        context: params.context,
      })
      if (!stored.success) return undefined
      const apiUrl = params.context.apiUrl || ""
      return `${apiUrl}/api/rooms/${params.roomId}/images/${imageId}`
    } catch (fallbackErr) {
      console.warn("[PluginAPI] Redis cover fallback failed:", fallbackErr)
      return undefined
    }
  }
}

async function storePlaylistArtworkVariants(params: {
  roomId: string
  playlistId: string
  playlistName?: string
  variants: { sm?: string; lg?: string }
  context: AppContext
}): Promise<LocalPlaylistArtwork | null> {
  const { coverIdentityHash } = await import("../../services/mediaFingerprint")
  const identityHash = coverIdentityHash({
    kind: "playlist",
    playlistName: params.playlistName || params.playlistId,
  })
  const hasAnyVariant = Boolean(params.variants.sm || params.variants.lg)
  if (!hasAnyVariant) {
    try {
      const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
      const { setCoverPointer } = await import("../../services/MediaObjectCache")
      const libraryId = await resolveMediaLibraryId({
        context: params.context,
        roomId: params.roomId,
      })
      await setCoverPointer({
        context: params.context,
        libraryId,
        identityHash,
        variant: "sm",
        pointer: { none: true },
      })
    } catch {
      /* optional */
    }
    return null
  }

  const [imageUrl, imageUrlLarge] = await Promise.all([
    params.variants.sm
      ? storeCoverVariantToS3({
          roomId: params.roomId,
          identityHash,
          dataUri: params.variants.sm,
          variant: "sm",
          context: params.context,
        })
      : Promise.resolve(undefined),
    params.variants.lg
      ? storeCoverVariantToS3({
          roomId: params.roomId,
          identityHash,
          dataUri: params.variants.lg,
          variant: "lg",
          context: params.context,
        })
      : Promise.resolve(undefined),
  ])
  const art: LocalPlaylistArtwork = {}
  if (imageUrl) art.imageUrl = imageUrl
  if (imageUrlLarge) art.imageUrlLarge = imageUrlLarge
  if (!art.imageUrl && art.imageUrlLarge) art.imageUrl = art.imageUrlLarge
  return art.imageUrl || art.imageUrlLarge ? art : null
}

async function storeAlbumArtworkVariants(params: {
  roomId: string
  albumId: string
  artist?: string
  name?: string
  variants: { sm?: string; lg?: string }
  context: AppContext
}): Promise<LocalPlaylistArtwork | null> {
  const { coverIdentityHash } = await import("../../services/mediaFingerprint")
  const identityHash = coverIdentityHash({
    kind: "album",
    artist: params.artist,
    album: params.name || params.albumId,
  })
  const hasAnyVariant = Boolean(params.variants.sm || params.variants.lg)
  if (!hasAnyVariant) {
    try {
      const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
      const { setCoverPointer } = await import("../../services/MediaObjectCache")
      const libraryId = await resolveMediaLibraryId({
        context: params.context,
        roomId: params.roomId,
      })
      await setCoverPointer({
        context: params.context,
        libraryId,
        identityHash,
        variant: "sm",
        pointer: { none: true },
      })
    } catch {
      /* optional */
    }
    return null
  }

  const [imageUrl, imageUrlLarge] = await Promise.all([
    params.variants.sm
      ? storeCoverVariantToS3({
          roomId: params.roomId,
          identityHash,
          dataUri: params.variants.sm,
          variant: "sm",
          context: params.context,
        })
      : Promise.resolve(undefined),
    params.variants.lg
      ? storeCoverVariantToS3({
          roomId: params.roomId,
          identityHash,
          dataUri: params.variants.lg,
          variant: "lg",
          context: params.context,
        })
      : Promise.resolve(undefined),
  ])
  const art: LocalPlaylistArtwork = {}
  if (imageUrl) art.imageUrl = imageUrl
  if (imageUrlLarge) art.imageUrlLarge = imageUrlLarge
  if (!art.imageUrl && art.imageUrlLarge) art.imageUrl = art.imageUrlLarge
  return art.imageUrl || art.imageUrlLarge ? art : null
}

/** Scoped catalog search and local-library access for one plugin (ADR 0201). */
export class PluginCatalogAPI extends PluginCapability implements CatalogPluginAPI {
  private async getMetadataSourceAccess() {
    const { MetadataSourceAccessService } = await import(
      "../../services/MetadataSourceAccessService"
    )
    return (
      (this.context as { metadataSourceAccess?: InstanceType<typeof MetadataSourceAccessService> })
        .metadataSourceAccess ?? new MetadataSourceAccessService(this.context)
    )
  }

  async listMetadataSources(roomId: string): Promise<{ id: string; label: string }[]> {
    const access = await this.getMetadataSourceAccess()
    return access.listMetadataSources(roomId)
  }

  async searchTracks(params: {
    roomId: string
    query: string
    sourceId?: string
    userId?: string
    limit?: number
  }): Promise<
    { success: true; tracks: PluginCatalogTrack[] } | { success: false; message: string }
  > {
    const query = params.query?.trim()
    if (!query) return { success: false, message: "query is required" }
    const limit = Math.min(
      PLUGIN_SEARCH_MAX_LIMIT,
      Math.max(1, Math.floor(params.limit ?? PLUGIN_SEARCH_DEFAULT_LIMIT)),
    )

    const [{ searchTracksAcrossSources }, { AdapterService }, { DJService }] = await Promise.all([
      import("../../operations/dj/searchTracks"),
      import("../../services/AdapterService"),
      import("../../services/DJService"),
    ])
    const djService = new DJService(this.context)
    const result = await searchTracksAcrossSources({
      context: this.context,
      adapterService: new AdapterService(this.context),
      roomId: params.roomId,
      userId: params.userId ?? null,
      query,
      sourceId: params.sourceId,
      includeEntities: false,
      searchSource: (src, q, options) => djService.searchForTrack(src, q, options),
    })
    if (!result.success) return result

    return {
      success: true,
      tracks: result.items.slice(0, limit).flatMap((item) => {
        const track = toPluginCatalogTrack(item)
        return track ? [track] : []
      }),
    }
  }

  async canAccessMetadataSource(params: {
    roomId: string
    userId: string
    sourceId: string
    action: MetadataSourceAccessAction
  }): Promise<boolean> {
    const access = await this.getMetadataSourceAccess()
    return access.canAccess(params)
  }

  async getEffectiveMetadataSourceIds(
    roomId: string,
    userId: string,
    action: MetadataSourceAccessAction,
  ): Promise<string[]> {
    const access = await this.getMetadataSourceAccess()
    return access.getEffectiveSourceIdsForUser(roomId, userId, action)
  }

  async checkLocalTrackPlaylistMembership(params: {
    roomId: string
    trackId: string
    playlistIds?: string[]
    albumIds?: string[]
    includeTrackAlbumId?: boolean
    firstMatch?: boolean
  }): Promise<{ playlistIds: string[]; albumIds: string[] }> {
    const {
      roomId,
      trackId,
      playlistIds = [],
      albumIds = [],
      includeTrackAlbumId = false,
      firstMatch = false,
    } = params
    const empty = { playlistIds: [] as string[], albumIds: [] as string[] }
    if (!trackId || (playlistIds.length === 0 && albumIds.length === 0 && !includeTrackAlbumId)) {
      return empty
    }
    try {
      const { getBridgeRpcClient, checkLocalTrackPlaylistMembership } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return empty
      return await checkLocalTrackPlaylistMembership({
        rpc,
        trackId,
        playlistIds,
        albumIds,
        includeTrackAlbumId,
        firstMatch,
      })
    } catch (e) {
      console.warn("[PluginAPI] checkLocalTrackPlaylistMembership failed:", e)
      return empty
    }
  }

  async checkLocalTrackPlaylistMembershipBatch(params: {
    roomId: string
    trackIds: readonly string[]
    playlistIds?: string[]
    albumIds?: string[]
    includeTrackAlbumId?: boolean
    firstMatch?: boolean
  }): Promise<Map<string, { playlistIds: string[]; albumIds: string[] }>> {
    const empty = new Map<string, { playlistIds: string[]; albumIds: string[] }>()
    try {
      const { getBridgeRpcClient, checkLocalTrackPlaylistMembershipBatch } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(params.roomId)
      if (!rpc) return empty
      return await checkLocalTrackPlaylistMembershipBatch({
        rpc,
        trackIds: params.trackIds,
        playlistIds: params.playlistIds,
        albumIds: params.albumIds,
        includeTrackAlbumId: params.includeTrackAlbumId,
        firstMatch: params.firstMatch,
      })
    } catch (e) {
      console.warn("[PluginAPI] checkLocalTrackPlaylistMembershipBatch failed:", e)
      return empty
    }
  }

  async listLocalPlaylists(
    roomId: string,
  ): Promise<Array<{ id: string; name: string; songCount?: number; comment?: string }>> {
    try {
      const { getBridgeRpcClient, listLocalPlaylists } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylists({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylists failed:", e)
      return []
    }
  }

  /**
   * Fetch playlist cover art from the daemon and park it in the room image store,
   * returning served URLs. The image id embeds a content hash so swapped artwork
   * gets a new URL despite the long-lived cache headers on the image route.
   * Row (`imageUrl`) and feature (`imageUrlLarge`) variants are stored separately.
   */
  async getLocalPlaylistArtwork(
    roomId: string,
    playlistIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    const ids = Array.from(new Set(playlistIds.map((id) => id.trim()).filter(Boolean)))
    if (ids.length === 0) return {}
    try {
      const { getBridgeRpcClient, getLocalPlaylistCoverArt, listLocalPlaylists } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return {}

      // Warm cover pointers before RPC (ADR 0186)
      const { coverIdentityHash } = await import("../../services/mediaFingerprint")
      const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
      const { getCoverPointer } = await import("../../services/MediaObjectCache")
      const libraryId = await resolveMediaLibraryId({ context: this.context, roomId })
      const playlists = await listLocalPlaylists({ rpc }).catch(() => [])
      const nameById = new Map(playlists.map((p) => [p.id, p.name] as const))

      const urls: Record<string, LocalPlaylistArtwork> = {}
      const needRpc: string[] = []
      for (const playlistId of ids) {
        const identityHash = coverIdentityHash({
          kind: "playlist",
          playlistName: nameById.get(playlistId) || playlistId,
        })
        const sm = await getCoverPointer({
          context: this.context,
          libraryId,
          identityHash,
          variant: "sm",
        })
        const lg = await getCoverPointer({
          context: this.context,
          libraryId,
          identityHash,
          variant: "lg",
        })
        if (sm && "none" in sm && sm.none) continue
        if (sm && "url" in sm) {
          const art: LocalPlaylistArtwork = { imageUrl: sm.url }
          if (lg && "url" in lg) art.imageUrlLarge = lg.url
          urls[playlistId] = art
          continue
        }
        needRpc.push(playlistId)
      }

      for (let i = 0; i < needRpc.length; i += LOCAL_COVER_STORE_BATCH) {
        const chunk = needRpc.slice(i, i + LOCAL_COVER_STORE_BATCH)
        const covers = await getLocalPlaylistCoverArt({ rpc, playlistIds: chunk })
        await Promise.all(
          Object.entries(covers).map(async ([playlistId, variants]) => {
            const art = await storePlaylistArtworkVariants({
              roomId,
              playlistId,
              playlistName: nameById.get(playlistId),
              variants,
              context: this.context,
            })
            if (art) urls[playlistId] = art
          }),
        )
        // Negative-cache only when the daemon answered with at least one cover in
        // this chunk. An entirely empty result usually means RPC failure (same as
        // track-list misses) — caching `{ none: true }` would hide art for 7 days.
        const rpcReturnedAny = Object.keys(covers).length > 0
        if (!rpcReturnedAny) continue
        for (const playlistId of chunk) {
          if (urls[playlistId] || covers[playlistId]) continue
          await storePlaylistArtworkVariants({
            roomId,
            playlistId,
            playlistName: nameById.get(playlistId),
            variants: {},
            context: this.context,
          })
        }
      }
      return urls
    } catch (e) {
      console.warn("[PluginAPI] getLocalPlaylistArtwork failed:", e)
      return {}
    }
  }

  /**
   * List Navidrome albums for Physical Media album-catalog derivation.
   * Returns [] when offline / old DJ Mac pack (unknown RPC).
   */
  async listLibraryAlbums(roomId: string): Promise<LibraryAlbumRow[]> {
    try {
      const { getBridgeRpcClient, listLibraryAlbums } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLibraryAlbums({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] listLibraryAlbums failed:", e)
      return []
    }
  }

  /**
   * Album cover art URLs re-hosted in the room image store (`al-cover-…`).
   */
  async getLocalAlbumArtwork(
    roomId: string,
    albumIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    const ids = Array.from(new Set(albumIds.map((id) => id.trim()).filter(Boolean)))
    if (ids.length === 0) return {}
    try {
      const { getBridgeRpcClient, getLocalAlbumCoverArt, listLibraryAlbums } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return {}

      const { coverIdentityHash } = await import("../../services/mediaFingerprint")
      const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
      const { getCoverPointer } = await import("../../services/MediaObjectCache")
      const libraryId = await resolveMediaLibraryId({ context: this.context, roomId })
      const albums = await listLibraryAlbums({ rpc }).catch(() => [])
      const metaById = new Map(
        albums.map((a) => [a.id, { name: a.name, artist: a.artist }] as const),
      )

      const urls: Record<string, LocalPlaylistArtwork> = {}
      const needRpc: string[] = []
      for (const albumId of ids) {
        const meta = metaById.get(albumId)
        const identityHash = coverIdentityHash({
          kind: "album",
          artist: meta?.artist,
          album: meta?.name || albumId,
        })
        const sm = await getCoverPointer({
          context: this.context,
          libraryId,
          identityHash,
          variant: "sm",
        })
        const lg = await getCoverPointer({
          context: this.context,
          libraryId,
          identityHash,
          variant: "lg",
        })
        if (sm && "none" in sm && sm.none) continue
        if (sm && "url" in sm) {
          const art: LocalPlaylistArtwork = { imageUrl: sm.url }
          if (lg && "url" in lg) art.imageUrlLarge = lg.url
          urls[albumId] = art
          continue
        }
        needRpc.push(albumId)
      }

      for (let i = 0; i < needRpc.length; i += LOCAL_COVER_STORE_BATCH) {
        const chunk = needRpc.slice(i, i + LOCAL_COVER_STORE_BATCH)
        const covers = await getLocalAlbumCoverArt({ rpc, albumIds: chunk })
        await Promise.all(
          Object.entries(covers).map(async ([albumId, variants]) => {
            const meta = metaById.get(albumId)
            const art = await storeAlbumArtworkVariants({
              roomId,
              albumId,
              artist: meta?.artist,
              name: meta?.name,
              variants,
              context: this.context,
            })
            if (art) urls[albumId] = art
          }),
        )
        // Same rule as playlists: empty chunk ⇒ RPC failure, do not negative-cache.
        const rpcReturnedAny = Object.keys(covers).length > 0
        if (!rpcReturnedAny) continue
        for (const albumId of chunk) {
          if (urls[albumId] || covers[albumId]) continue
          const meta = metaById.get(albumId)
          await storeAlbumArtworkVariants({
            roomId,
            albumId,
            artist: meta?.artist,
            name: meta?.name,
            variants: {},
            context: this.context,
          })
        }
      }
      return urls
    } catch (e) {
      console.warn("[PluginAPI] getLocalAlbumArtwork failed:", e)
      return {}
    }
  }

  /** Album-comment rollup per Navidrome album id. Empty on failure or an old DJ Mac pack. */
  async getLocalAlbumComments(roomId: string, albumIds: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(albumIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) return {}
    try {
      const { getBridgeRpcClient, getLocalAlbumComments } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return {}
      return await getLocalAlbumComments({ rpc, albumIds: ids })
    } catch (e) {
      console.warn("[PluginAPI] getLocalAlbumComments failed:", e)
      return {}
    }
  }

  /**
   * Ordered track ids for a Navidrome album (de-dup / lean listing). Empty on failure.
   * Prefers `listAlbumTrackIds` RPC; falls back to getAlbum on old packs.
   */
  async listLocalAlbumTrackIds(roomId: string, albumId: string): Promise<string[]> {
    const id = albumId.trim()
    if (!id) return []
    try {
      const { getBridgeRpcClient, listLocalAlbumTrackIds } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalAlbumTrackIds({ rpc, albumId: id })
    } catch (e) {
      console.warn("[PluginAPI] listLocalAlbumTrackIds failed:", e)
      return []
    }
  }

  /** Track ids on an album in one of the room's metadata sources (ADR 0216). */
  async getAlbumTrackIds(params: {
    roomId: string
    sourceId: string
    albumId: string
  }): Promise<string[]> {
    const { roomId, sourceId, albumId } = params
    if (sourceId === "local") return this.listLocalAlbumTrackIds(roomId, albumId)
    const { fetchSourceAlbumTracks } = await import("../../operations/dj/mediaItemTracks")
    const tracks = await fetchSourceAlbumTracks({ context: this.context, roomId, sourceId, albumId })
    return tracks?.map((track) => track.id) ?? []
  }

  async invalidateLocalLibraryCache(roomId: string): Promise<boolean> {
    try {
      const { metadataBrowseRoomPrefix } = await import("@repo/utils")
      await this.context.cache?.deleteByPrefix(metadataBrowseRoomPrefix(roomId))

      const { resolveMediaLibraryId } = await import("../../operations/bridge/bridgeDaemonId")
      const { invalidateCoverPointersForLibrary } = await import("../../services/MediaObjectCache")
      const libraryId = await resolveMediaLibraryId({ context: this.context, roomId })
      await invalidateCoverPointersForLibrary(this.context, libraryId)

      const { getBridgeRpcClient, invalidateLocalLibraryCache } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return true
      return await invalidateLocalLibraryCache({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] invalidateLocalLibraryCache failed:", e)
      return false
    }
  }

  async listLocalPlaylistTracks(
    roomId: string,
    playlistId: string,
  ): Promise<import("@repo/types").MetadataSourceTrack[]> {
    try {
      const { getBridgeRpcClient, listLocalPlaylistTracks } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylistTracks({ rpc, playlistId })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylistTracks failed:", e)
      return []
    }
  }

  /**
   * Ordered playlist track ids (+ albumId) without full track mapping (de-dup).
   * [] when offline / old DJ Mac pack.
   */
  async listLocalPlaylistTrackIds(
    roomId: string,
    playlistId: string,
  ): Promise<Array<{ id: string; albumId?: string }>> {
    try {
      const { getBridgeRpcClient, listLocalPlaylistTrackIds } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylistTrackIds({ rpc, playlistId })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylistTrackIds failed:", e)
      return []
    }
  }
}

