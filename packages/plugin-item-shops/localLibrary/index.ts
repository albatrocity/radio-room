import {
  allowQueueRequest,
  parseArtworkFrame,
  rejectQueueRequest,
  type MetadataSourceAccessGrantParams,
  type MetadataSourceAccessGrantResult,
  type PhysicalMediaItem,
  type PhysicalMediaNowPlayingFrame,
  type PluginContext,
  type QueueValidationParams,
  type QueueValidationResult,
  type ResolvedPhysicalMediaItem,
} from "@repo/types"
import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "../items/index"
import {
  DEFAULT_LOCAL_LIBRARY_GRANTS,
  type LocalLibraryGrantConfig,
  type PhysicalMediaOverride,
} from "./config"
import { buildEffectiveItemCatalog, buildEffectiveShopCatalog } from "./catalog"
import {
  albumIdsShadowedByPlaylists,
  derivePhysicalMediaItems,
  derivePhysicalMediaItemsFromAlbums,
  parsePhysicalMediaName,
} from "./physicalMedia"
import {
  buildGrantCatalogEntries,
  catalogByShortId,
  isLocalLibraryGrantShortId,
  listHeldLocalLibraryGrants,
  pickGrantToConsume,
  playlistMapFromGrantConfig,
  resolveLocalCatalogScope,
  type LocalCatalogScope,
} from "./grants"

function physicalMediaArtworkFields(definition?: ItemCatalogEntry["definition"]): {
  icon?: ItemCatalogEntry["definition"]["icon"]
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ItemCatalogEntry["definition"]["artworkFrame"]
} {
  return {
    ...(definition?.icon ? { icon: definition.icon } : {}),
    ...(definition?.imageUrl ? { imageUrl: definition.imageUrl } : {}),
    ...(definition?.imageUrlLarge ? { imageUrlLarge: definition.imageUrlLarge } : {}),
    ...(definition?.artworkFrame ? { artworkFrame: definition.artworkFrame } : {}),
  }
}

/**
 * Extraction-ready local-library surface. ItemShopsPlugin delegates grant
 * access, catalog filters, and queue redemption here so the module can later
 * become its own plugin without a data migration.
 */
export class LocalLibraryModule {
  grantCatalog: ItemCatalogEntry[] = ITEM_CATALOG.filter((e) => e.localLibraryGrant)
  derivedPhysicalMedia: ItemCatalogEntry[] = []
  private derivedPlaylistMap: Record<string, string> = {}
  private derivedAlbumMap: Record<string, string> = {}
  /** Album ids already fetched for sleeves this refresh (avoids hydrate spin on missing art). */
  private albumArtworkAttempted = new Set<string>()

  constructor(
    private readonly pluginName: string,
    private readonly getContext: () => PluginContext | undefined,
  ) {}

  applyConfig(grants: readonly LocalLibraryGrantConfig[]): {
    itemCatalog: ItemCatalogEntry[]
    shopCatalog: ItemShopsShopCatalogEntry[]
    grantCatalog: ItemCatalogEntry[]
  } {
    const configGrants = buildGrantCatalogEntries(grants)
    const staticGrants = ITEM_CATALOG.filter((e) => e.localLibraryGrant)
    const grantCatalog = [...staticGrants, ...configGrants, ...this.derivedPhysicalMedia]
    this.grantCatalog = grantCatalog
    return {
      itemCatalog: buildEffectiveItemCatalog(grants, this.derivedPhysicalMedia),
      shopCatalog: buildEffectiveShopCatalog(grants, this.derivedPhysicalMedia),
      grantCatalog,
    }
  }

  async refreshDerivedPhysicalMedia(
    overrides: readonly PhysicalMediaOverride[] = [],
    options: {
      derivePrefixedPlaylists?: boolean
      deriveAlbums?: boolean
    } = {},
  ): Promise<{
    itemCatalog: ItemCatalogEntry[]
    shopCatalog: ItemShopsShopCatalogEntry[]
    grantCatalog: ItemCatalogEntry[]
  } | null> {
    const derivePrefixedPlaylists = options.derivePrefixedPlaylists !== false
    const deriveAlbums = options.deriveAlbums === true
    const context = this.getContext()
    if (!context) return null
    const room = await context.getRoom()
    if (room?.playbackControllerId !== "bridge") {
      this.derivedPhysicalMedia = []
      this.derivedPlaylistMap = {}
      this.derivedAlbumMap = {}
      this.albumArtworkAttempted.clear()
      return null
    }

    const playlists = derivePrefixedPlaylists
      ? await context.api.listLocalPlaylists(context.roomId)
      : []
    const mediaPlaylists = playlists.filter((p) => parsePhysicalMediaName(p.name) != null)
    const artwork =
      derivePrefixedPlaylists && mediaPlaylists.length > 0
        ? await context.api.getLocalPlaylistArtwork(
            context.roomId,
            mediaPlaylists.map((p) => p.id),
          )
        : {}

    const albums = deriveAlbums ? await context.api.listLibraryAlbums(context.roomId) : []

    let omitAlbumIds = new Set<string>()
    const albumRatingByPlaylistId: Record<string, number> = {}

    if (derivePrefixedPlaylists && deriveAlbums && mediaPlaylists.length > 0 && albums.length > 0) {
      const playlistTrackLists: { playlistId: string; trackIds: string[] }[] = []
      const candidateAlbumIds = new Set<string>()
      const playlistNdIdToAlbumId = new Map<string, string>()

      for (const pl of mediaPlaylists) {
        const ndId = pl.id.trim()
        if (!ndId) continue
        const trackRefs = await context.api.listLocalPlaylistTrackIds(context.roomId, ndId)
        const trackIds = trackRefs.map((t) => t.id.trim()).filter(Boolean)
        if (trackIds.length === 0) continue
        playlistTrackLists.push({ playlistId: ndId, trackIds })

        const albumIdsOnPlaylist = trackRefs
          .map((t) => t.albumId?.trim())
          .filter((id): id is string => Boolean(id))
        if (albumIdsOnPlaylist.length === 0) continue
        const uniqueAlbum = [...new Set(albumIdsOnPlaylist)]
        if (uniqueAlbum.length !== 1) continue
        const onlyAlbum = uniqueAlbum[0]!
        const albumStub = albums.find((a) => a.id.trim() === onlyAlbum)
        if (!albumStub) continue
        if ((albumStub.songCount ?? 0) > 0 && albumStub.songCount !== trackIds.length) continue
        candidateAlbumIds.add(onlyAlbum)
        playlistNdIdToAlbumId.set(ndId, onlyAlbum)
      }

      const albumTrackLists: { id: string; trackIds: string[] }[] = []
      for (const albumId of candidateAlbumIds) {
        const trackIds = await context.api.listLocalAlbumTrackIds(context.roomId, albumId)
        if (trackIds.length === 0) continue
        albumTrackLists.push({ id: albumId, trackIds })
      }
      omitAlbumIds = albumIdsShadowedByPlaylists(
        playlistTrackLists.map(({ trackIds }) => ({ trackIds })),
        albumTrackLists,
      )

      for (const [playlistNdId, albumId] of playlistNdIdToAlbumId) {
        if (!omitAlbumIds.has(albumId)) continue
        const rating = albums.find((a) => a.id.trim() === albumId)?.userRating
        if (rating == null) continue
        albumRatingByPlaylistId[playlistNdId] = rating
      }
    }

    const playlistItems: ItemCatalogEntry[] = []
    let playlistMap: Record<string, string> = {}
    if (derivePrefixedPlaylists) {
      const derived = derivePhysicalMediaItems(
        playlists,
        overrides,
        artwork,
        albumRatingByPlaylistId,
      )
      playlistItems.push(...derived.items)
      playlistMap = derived.playlistMap
    }

    let albumItems: ItemCatalogEntry[] = []
    let albumMap: Record<string, string> = {}

    if (deriveAlbums) {
      // Album sleeves are filled lazily / in background batches (perf F3) so
      // config + bridge reconnect do not block on N× cover RPC + image store.
      this.albumArtworkAttempted.clear()
      const derivedAlbums = derivePhysicalMediaItemsFromAlbums(albums, {}, omitAlbumIds)
      albumItems = derivedAlbums.items
      albumMap = derivedAlbums.albumMap
    } else {
      this.albumArtworkAttempted.clear()
    }

    this.derivedPhysicalMedia = [...playlistItems, ...albumItems]
    this.derivedPlaylistMap = playlistMap
    this.derivedAlbumMap = albumMap
    return null
  }

  /** Navidrome album ids for derived SKUs that still need a sleeve fetch. */
  albumIdsMissingArtwork(): string[] {
    const missing: string[] = []
    for (const entry of this.derivedPhysicalMedia) {
      const albumId = this.derivedAlbumMap[entry.definition.shortId]?.trim()
      if (!albumId) continue
      if (entry.definition.imageUrl?.trim()) continue
      if (this.albumArtworkAttempted.has(albumId)) continue
      missing.push(albumId)
    }
    return missing
  }

  /**
   * Patch derived album SKUs with re-hosted cover URLs. Returns whether any
   * definition changed.
   */
  applyAlbumArtwork(
    artworkByAlbumId: Readonly<Record<string, { imageUrl?: string; imageUrlLarge?: string }>>,
  ): boolean {
    let changed = false
    this.derivedPhysicalMedia = this.derivedPhysicalMedia.map((entry) => {
      const albumId = this.derivedAlbumMap[entry.definition.shortId]?.trim()
      if (!albumId) return entry
      const art = artworkByAlbumId[albumId]
      if (!art) return entry
      const imageUrl = art.imageUrl?.trim()
      const imageUrlLarge = art.imageUrlLarge?.trim()
      if (!imageUrl && !imageUrlLarge) return entry
      if (
        entry.definition.imageUrl === imageUrl &&
        (entry.definition.imageUrlLarge ?? undefined) === (imageUrlLarge || undefined)
      ) {
        return entry
      }
      changed = true
      return {
        ...entry,
        definition: {
          ...entry.definition,
          ...(imageUrl ? { imageUrl } : {}),
          ...(imageUrlLarge ? { imageUrlLarge } : {}),
        },
      }
    })
    return changed
  }

  /**
   * Fetch + apply sleeves for specific derived album shortIds (shop offers / held
   * items). No-op for playlist SKUs and albums that already have imageUrl.
   */
  async ensureAlbumArtworkForShortIds(shortIds: readonly string[]): Promise<boolean> {
    const context = this.getContext()
    if (!context) return false
    const albumIds: string[] = []
    for (const raw of shortIds) {
      const shortId = raw.trim()
      if (!shortId) continue
      const albumId = this.derivedAlbumMap[shortId]?.trim()
      if (!albumId) continue
      const entry = this.derivedPhysicalMedia.find((e) => e.definition.shortId === shortId)
      if (entry?.definition.imageUrl?.trim()) continue
      if (this.albumArtworkAttempted.has(albumId)) continue
      albumIds.push(albumId)
    }
    const unique = [...new Set(albumIds)]
    if (unique.length === 0) return false
    for (const id of unique) this.albumArtworkAttempted.add(id)
    const artwork = await context.api.getLocalAlbumArtwork(context.roomId, unique)
    return this.applyAlbumArtwork(artwork)
  }

  /**
   * Background fill of missing album sleeves in batches. Call after refresh so
   * the catalog can register without waiting on the full library.
   */
  async hydrateMissingAlbumArtwork(options: {
    batchSize?: number
    shouldContinue?: () => boolean
    onBatch?: () => void | Promise<void>
  } = {}): Promise<void> {
    const batchSize = Math.max(1, options.batchSize ?? 24)
    const context = this.getContext()
    if (!context) return

    for (;;) {
      if (options.shouldContinue && !options.shouldContinue()) return
      const missing = this.albumIdsMissingArtwork()
      if (missing.length === 0) return
      const batch = missing.slice(0, batchSize)
      for (const id of batch) this.albumArtworkAttempted.add(id)
      const artwork = await context.api.getLocalAlbumArtwork(context.roomId, batch)
      const changed = this.applyAlbumArtwork(artwork)
      if (changed && options.onBatch) await options.onBatch()
    }
  }

  isGrantShortId(shortId: string): boolean {
    return isLocalLibraryGrantShortId(shortId, this.grantCatalog)
  }

  playlistMap(grants: readonly LocalLibraryGrantConfig[]): Record<string, string> {
    return { ...playlistMapFromGrantConfig(grants), ...this.derivedPlaylistMap }
  }

  albumMap(): Record<string, string> {
    return { ...this.derivedAlbumMap }
  }

  async listPhysicalMediaItems(userId: string): Promise<PhysicalMediaItem[]> {
    const context = this.getContext()
    if (!context) return []
    const inv = await context.inventory.getInventory(userId)
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
    })
    const byShort = catalogByShortId(this.grantCatalog)
    const derivedByShort = new Map(
      this.derivedPhysicalMedia.map((e) => [e.definition.shortId, e] as const),
    )
    const seen = new Set<string>()
    const items: PhysicalMediaItem[] = []
    for (const h of held) {
      if (h.grant.scope !== "playlist" && h.grant.scope !== "album") continue
      if (seen.has(h.shortId)) continue
      seen.add(h.shortId)
      const definition =
        derivedByShort.get(h.shortId)?.definition ?? byShort.get(h.shortId)?.definition
      items.push({
        mediaKey: h.shortId,
        name: h.name,
        ...physicalMediaArtworkFields(definition),
      })
    }
    return items
  }

  /** Short ids for held album-scope Physical Media (for lazy sleeve ensure). */
  async heldAlbumPhysicalMediaShortIds(userId: string): Promise<string[]> {
    const context = this.getContext()
    if (!context) return []
    const inv = await context.inventory.getInventory(userId)
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
    })
    return held.filter((h) => h.grant.scope === "album").map((h) => h.shortId)
  }

  async resolveHeldPhysicalMediaItem(
    userId: string,
    mediaKey: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): Promise<ResolvedPhysicalMediaItem | null> {
    const key = mediaKey.trim()
    if (!key) return null
    const context = this.getContext()
    if (!context) return null
    const inv = await context.inventory.getInventory(userId)
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
    })
    const match = held.find(
      (h) =>
        h.shortId === key && (h.grant.scope === "playlist" || h.grant.scope === "album"),
    )
    if (!match) return null
    const definition = catalogByShortId(this.grantCatalog).get(match.shortId)?.definition
    const item: PhysicalMediaItem = {
      mediaKey: match.shortId,
      name: match.name,
      ...physicalMediaArtworkFields(definition),
    }
    if (match.grant.scope === "playlist") {
      const playlistId = this.playlistMap(grants)[match.grant.playlistKey]?.trim()
      if (!playlistId) return null
      return { kind: "playlist", playlistId, item }
    }
    if (match.grant.scope === "album") {
      const albumId = this.albumMap()[match.grant.albumKey]?.trim()
      if (!albumId) return null
      return { kind: "album", albumId, item }
    }
    return null
  }

  /**
   * Resolve a catalog Physical Media item by shortId (no inventory check).
   * Used for Record Store preview authz when the item is on the shopper's offers.
   */
  resolveCatalogPhysicalMediaItem(
    mediaKey: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): ResolvedPhysicalMediaItem | null {
    const key = mediaKey.trim()
    if (!key) return null
    const entry = catalogByShortId(this.grantCatalog).get(key)
    if (!entry?.localLibraryGrant) return null
    const grant = entry.localLibraryGrant
    const item: PhysicalMediaItem = {
      mediaKey: key,
      name: entry.definition.name ?? key,
      ...physicalMediaArtworkFields(entry.definition),
    }
    if (grant.scope === "playlist") {
      const playlistId = this.playlistMap(grants)[key]?.trim()
      if (!playlistId) return null
      return { kind: "playlist", playlistId, item }
    }
    if (grant.scope === "album") {
      const albumId = this.albumMap()[key]?.trim()
      if (!albumId) return null
      return { kind: "album", albumId, item }
    }
    return null
  }

  /**
   * Preview authz: held item OR caller-supplied shop offer shortIds (ADR 0103).
   */
  async resolvePreviewablePhysicalMediaItem(
    userId: string,
    mediaKey: string,
    grants: readonly LocalLibraryGrantConfig[],
    shopOfferShortIds?: readonly string[],
  ): Promise<ResolvedPhysicalMediaItem | null> {
    const held = await this.resolveHeldPhysicalMediaItem(userId, mediaKey, grants)
    if (held) return held
    const key = mediaKey.trim()
    if (!key || !shopOfferShortIds?.includes(key)) return null
    return this.resolveCatalogPhysicalMediaItem(key, grants)
  }

  /**
   * If these Local tracks belong to a derived Physical Media playlist or album,
   * return the sleeve for each. Playlist cover is optional; the client fills the
   * frame with track album art when `imageUrl` is missing. Duplicate ids share one RPC.
   *
   * Album frames use the track's Navidrome album id (`includeTrackAlbumId`) rather
   * than scanning every derived album SKU (catalog mode can be thousands of ids).
   * Prefixed playlists still win when both match (ADR 0110).
   */
  async resolveNowPlayingFrames(
    trackIds: readonly string[],
  ): Promise<Map<string, PhysicalMediaNowPlayingFrame>> {
    const out = new Map<string, PhysicalMediaNowPlayingFrame>()
    const context = this.getContext()
    if (!context) return out

    const byPlaylistId = new Map<string, (typeof this.derivedPhysicalMedia)[number]>()
    const byAlbumId = new Map<string, (typeof this.derivedPhysicalMedia)[number]>()
    const playlistIds: string[] = []
    for (const entry of this.derivedPhysicalMedia) {
      const artworkFrame = entry.definition.artworkFrame
        ? parseArtworkFrame(entry.definition.artworkFrame)
        : undefined
      if (!artworkFrame) continue
      const playlistNdId = this.derivedPlaylistMap[entry.definition.shortId]?.trim()
      if (playlistNdId) {
        playlistIds.push(playlistNdId)
        byPlaylistId.set(playlistNdId, entry)
        continue
      }
      const albumNdId = this.derivedAlbumMap[entry.definition.shortId]?.trim()
      if (albumNdId) {
        byAlbumId.set(albumNdId, entry)
      }
    }
    if (playlistIds.length === 0 && byAlbumId.size === 0) return out

    const uniqueIds = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))]
    await Promise.all(
      uniqueIds.map(async (id) => {
        const memberIds = await context.api.checkLocalTrackPlaylistMembership({
          roomId: context.roomId,
          trackId: id,
          playlistIds,
          // Do not pass derived album ids — intersect the track album locally.
          includeTrackAlbumId: byAlbumId.size > 0,
          firstMatch: true,
        })
        const applyEntry = (entry: (typeof this.derivedPhysicalMedia)[number] | undefined) => {
          const artworkFrame = entry?.definition.artworkFrame
            ? parseArtworkFrame(entry.definition.artworkFrame)
            : undefined
          if (!artworkFrame) return false
          const imageUrl = entry?.definition.imageUrl?.trim()
          const imageUrlLarge = entry?.definition.imageUrlLarge?.trim()
          out.set(id, {
            artworkFrame,
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageUrlLarge ? { imageUrlLarge } : {}),
          })
          return true
        }
        for (const memberId of memberIds.playlistIds) {
          if (applyEntry(byPlaylistId.get(memberId))) return
        }
        for (const memberId of memberIds.albumIds) {
          if (applyEntry(byAlbumId.get(memberId))) return
        }
      }),
    )
    return out
  }

  async resolveNowPlayingFrame(trackId: string): Promise<PhysicalMediaNowPlayingFrame | undefined> {
    const frames = await this.resolveNowPlayingFrames([trackId])
    return frames.get(trackId.trim())
  }

  async grantMetadataSourceAccess(
    params: MetadataSourceAccessGrantParams,
    config: { enabled: boolean; localLibraryGrants?: LocalLibraryGrantConfig[] },
  ): Promise<MetadataSourceAccessGrantResult> {
    const context = this.getContext()
    if (!context || !config.enabled) return "abstain"
    if (params.sourceId !== "local") return "abstain"
    const scope = await this.resolveUserLocalCatalogScope(
      params.userId,
      config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS,
    )
    return scope.mode === "none" ? "abstain" : "grant"
  }

  async resolveLocalLibraryCatalogFilter(params: {
    roomId: string
    userId: string
    enabled: boolean
    grants: readonly LocalLibraryGrantConfig[]
  }): Promise<
    | { mode: "unrestricted" }
    | { mode: "playlists"; playlistIds: string[]; albumIds: string[] }
    | "abstain"
  > {
    if (!this.getContext() || !params.enabled) return "abstain"
    const scope = await this.resolveUserLocalCatalogScope(params.userId, params.grants)
    if (scope.mode === "none") return "abstain"
    if (scope.mode === "unrestricted") return { mode: "unrestricted" }
    return {
      mode: "playlists",
      playlistIds: scope.playlistIds,
      albumIds: scope.albumIds,
    }
  }

  async validateQueueRequest(
    params: QueueValidationParams,
    config: { enabled: boolean; localLibraryGrants?: LocalLibraryGrantConfig[] },
  ): Promise<QueueValidationResult> {
    const context = this.getContext()
    if (!context || !config.enabled) return allowQueueRequest()
    if (params.mediaSourceType !== "local") return allowQueueRequest()

    const isAdmin = await context.api.isRoomAdmin(params.roomId, params.userId)
    if (isAdmin) return allowQueueRequest()

    const room = await context.getRoom()
    if (room?.metadataSourceAccess?.local !== "restricted") return allowQueueRequest()

    const grants = config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const inv = await context.inventory.getInventory(params.userId)
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
    })
    if (held.length === 0) return allowQueueRequest()

    const playlistMap = this.playlistMap(grants)
    const albumMap = this.albumMap()
    const playlistHeld = held.filter((h) => h.grant.scope === "playlist")
    const albumHeld = held.filter((h) => h.grant.scope === "album")
    const playlistIdsForMembership = playlistHeld
      .map((h) =>
        h.grant.scope === "playlist" ? playlistMap[h.grant.playlistKey]?.trim() : "",
      )
      .filter((id): id is string => Boolean(id))
    const albumIdsForMembership = albumHeld
      .map((h) => (h.grant.scope === "album" ? albumMap[h.grant.albumKey]?.trim() : ""))
      .filter((id): id is string => Boolean(id))

    const trackInPlaylistKey: Record<string, boolean> = {}
    const trackInAlbumKey: Record<string, boolean> = {}
    if (playlistIdsForMembership.length > 0 || albumIdsForMembership.length > 0) {
      const memberIds = await context.api.checkLocalTrackPlaylistMembership({
        roomId: params.roomId,
        trackId: params.trackId,
        playlistIds: playlistIdsForMembership,
        albumIds: albumIdsForMembership,
      })
      const playlistMemberSet = new Set(memberIds.playlistIds)
      const albumMemberSet = new Set(memberIds.albumIds)
      for (const h of playlistHeld) {
        if (h.grant.scope !== "playlist") continue
        const ndId = playlistMap[h.grant.playlistKey]?.trim()
        trackInPlaylistKey[h.grant.playlistKey] = Boolean(ndId && playlistMemberSet.has(ndId))
      }
      for (const h of albumHeld) {
        if (h.grant.scope !== "album") continue
        const ndId = albumMap[h.grant.albumKey]?.trim()
        trackInAlbumKey[h.grant.albumKey] = Boolean(ndId && albumMemberSet.has(ndId))
      }
    } else {
      for (const h of playlistHeld) {
        if (h.grant.scope === "playlist") {
          trackInPlaylistKey[h.grant.playlistKey] = false
        }
      }
      for (const h of albumHeld) {
        if (h.grant.scope === "album") {
          trackInAlbumKey[h.grant.albumKey] = false
        }
      }
    }

    const coveredByDurable = held.some((h) => {
      if (h.grant.redemption !== "durable") return false
      if (h.grant.scope === "library") return true
      if (h.grant.scope === "playlist") {
        return trackInPlaylistKey[h.grant.playlistKey] === true
      }
      if (h.grant.scope === "album") {
        return trackInAlbumKey[h.grant.albumKey] === true
      }
      return false
    })
    if (coveredByDurable) return allowQueueRequest()

    const pick = pickGrantToConsume({ held, trackInPlaylistKey })
    if (!pick) {
      const hasLibrary = held.some((h) => h.grant.scope === "library")
      if (!hasLibrary) {
        return rejectQueueRequest("That track isn't available on your Library shelf.")
      }
      return allowQueueRequest()
    }

    const removed = await context.inventory.removeItem(params.userId, pick.itemId, 1)
    if (removed) {
      await context.api.sendUserSystemMessage(
        params.roomId,
        params.userId,
        `${pick.name} redeemed for a Library track.`,
        { type: "alert", status: "success" },
      )
    }
    return allowQueueRequest()
  }

  private async resolveUserLocalCatalogScope(
    userId: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): Promise<LocalCatalogScope> {
    const context = this.getContext()
    if (!context) return { mode: "none" }
    const inv = await context.inventory.getInventory(userId)
    return resolveLocalCatalogScope({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
      localLibraryPlaylists: this.playlistMap(grants),
      localLibraryAlbums: this.albumMap(),
    })
  }
}
