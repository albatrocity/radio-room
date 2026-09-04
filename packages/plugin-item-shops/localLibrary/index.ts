import {
  allowQueueRequest,
  parseArtworkFrame,
  rejectQueueRequest,
  type ItemDefinition,
  type PhysicalMediaFormat,
  type MetadataSourceAccessGrantParams,
  type UserInventory,
  type MetadataSourceAccessGrantResult,
  type PhysicalMediaItem,
  type PhysicalMediaNowPlayingFrame,
  type PluginContext,
  type QueueValidationParams,
  type QueueValidationResult,
  type ResolvedPhysicalMediaItem,
  PHYSICAL_MEDIA_ORIGIN_KEY,
  PHYSICAL_MEDIA_CONDITION_KEY,
} from "@repo/types"
import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "../items/index"
import {
  DEFAULT_LOCAL_LIBRARY_GRANTS,
  type LocalLibraryGrantConfig,
  type PhysicalMediaOverride,
} from "./config"
import { buildEffectiveItemCatalog, buildEffectiveShopCatalog } from "./catalog"
import { DEDUP_RPC_CONCURRENCY, mapWithConcurrency } from "./concurrency"
import {
  albumIdsShadowedByPlaylists,
  derivePhysicalMediaItems,
  derivePhysicalMediaItemsFromAlbums,
  parsePhysicalMediaName,
} from "./physicalMedia"
import {
  MEDIA_CONDITION_LABELS,
  CONDITION_WEAR_RANK,
  degradeCondition,
  readItemCondition,
} from "./condition"
import { brokenMediaForRecord } from "../items/shared/brokenMedia"
import { pickRandomRestoreCandidateFromCatalog } from "../items/shared/restoreMedia"
import {
  buildGrantCatalogEntries,
  catalogByShortId,
  definitionIdForShortId,
  isLocalLibraryGrantShortId,
  listHeldLocalLibraryGrants,
  matchingDurableRecords,
  pickGrantToConsume,
  playlistMapFromGrantConfig,
  resolveLocalCatalogScope,
  LOCAL_LIBRARY_QUEUE_REJECT_REASON,
  type HeldLocalLibraryGrant,
  type LocalCatalogScope,
} from "./grants"
import {
  PLAYBACK_DEVICE_MISSING_REASON,
  playableFormats,
  requiresPlaybackDevice,
} from "./playbackDevices"

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
  /** Local track id → last playlist/album membership (cleared on catalog refresh). */
  private sleeveMembershipMemo = new Map<string, { playlistIds: string[]; albumIds: string[] }>()

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
      this.sleeveMembershipMemo.clear()
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
      const playlistNdIdToAlbumId = new Map<string, string>()
      const playlistRows = await mapWithConcurrency(
        mediaPlaylists,
        DEDUP_RPC_CONCURRENCY,
        async (pl) => {
          const ndId = pl.id.trim()
          if (!ndId) return null
          const trackRefs = await context.api.listLocalPlaylistTrackIds(context.roomId, ndId)
          const trackIds = trackRefs.map((t) => t.id.trim()).filter(Boolean)
          if (trackIds.length === 0) return null

          const albumIdsOnPlaylist = trackRefs
            .map((t) => t.albumId?.trim())
            .filter((id): id is string => Boolean(id))
          let onlyAlbum: string | undefined
          if (albumIdsOnPlaylist.length > 0) {
            const uniqueAlbum = [...new Set(albumIdsOnPlaylist)]
            if (uniqueAlbum.length === 1) {
              const candidate = uniqueAlbum[0]!
              const albumStub = albums.find((a) => a.id.trim() === candidate)
              if (
                albumStub &&
                !((albumStub.songCount ?? 0) > 0 && albumStub.songCount !== trackIds.length)
              ) {
                onlyAlbum = candidate
              }
            }
          }
          return { playlistId: ndId, trackIds, onlyAlbum }
        },
      )

      const playlistTrackLists: { playlistId: string; trackIds: string[] }[] = []
      const candidateAlbumIds = new Set<string>()
      for (const row of playlistRows) {
        if (!row) continue
        playlistTrackLists.push({ playlistId: row.playlistId, trackIds: row.trackIds })
        if (row.onlyAlbum) {
          candidateAlbumIds.add(row.onlyAlbum)
          playlistNdIdToAlbumId.set(row.playlistId, row.onlyAlbum)
        }
      }

      const albumIdList = Array.from(candidateAlbumIds)
      const albumRows = await mapWithConcurrency(
        albumIdList,
        DEDUP_RPC_CONCURRENCY,
        async (albumId) => {
          const trackIds = await context.api.listLocalAlbumTrackIds(context.roomId, albumId)
          if (trackIds.length === 0) return null
          return { id: albumId, trackIds }
        },
      )
      const albumTrackLists = albumRows.filter(
        (row): row is { id: string; trackIds: string[] } => row != null,
      )
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
    this.sleeveMembershipMemo.clear()
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
  ): string[] {
    const changedShortIds: string[] = []
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
      changedShortIds.push(entry.definition.shortId)
      return {
        ...entry,
        definition: {
          ...entry.definition,
          ...(imageUrl ? { imageUrl } : {}),
          ...(imageUrlLarge ? { imageUrlLarge } : {}),
        },
      }
    })
    return changedShortIds
  }

  /**
   * Fetch + apply sleeves for specific derived album shortIds (shop offers / held
   * items). No-op for playlist SKUs and albums that already have imageUrl.
   */
  async ensureAlbumArtworkForShortIds(shortIds: readonly string[]): Promise<string[]> {
    const context = this.getContext()
    if (!context) return []
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
    if (unique.length === 0) return []
    for (const id of unique) this.albumArtworkAttempted.add(id)
    const artwork = await context.api.getLocalAlbumArtwork(context.roomId, unique)
    return this.applyAlbumArtwork(artwork)
  }

  /**
   * Background fill of missing album sleeves in batches. Call after refresh so
   * the catalog can register without waiting on the full library.
   */
  async hydrateMissingAlbumArtwork(
    options: {
      batchSize?: number
      shouldContinue?: () => boolean
      onBatch?: (changedShortIds: string[]) => void | Promise<void>
    } = {},
  ): Promise<void> {
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
      if (changed.length > 0 && options.onBatch) await options.onBatch(changed)
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
    const held = await this.getHeldGrants(userId)
    const byShort = catalogByShortId(this.grantCatalog)
    const derivedByShort = new Map(
      this.derivedPhysicalMedia.map((e) => [e.definition.shortId, e] as const),
    )
    const byMediaKey = new Map<string, PhysicalMediaItem>()
    for (const h of held) {
      if (h.grant.scope !== "playlist" && h.grant.scope !== "album") continue
      const definition =
        derivedByShort.get(h.shortId)?.definition ?? byShort.get(h.shortId)?.definition
      const next: PhysicalMediaItem = {
        mediaKey: h.shortId,
        name: h.name,
        ...physicalMediaArtworkFields(definition),
        ...(h.condition ? { condition: h.condition } : {}),
      }
      const existing = byMediaKey.get(h.shortId)
      if (!existing) {
        byMediaKey.set(h.shortId, next)
        continue
      }
      const existingRank = CONDITION_WEAR_RANK[existing.condition ?? "mint"]
      const nextRank = CONDITION_WEAR_RANK[next.condition ?? "mint"]
      if (nextRank > existingRank) existing.condition = next.condition
    }
    return [...byMediaKey.values()]
  }

  /** Short ids for held album-scope Physical Media (for lazy sleeve ensure). */
  async heldAlbumPhysicalMediaShortIds(userId: string): Promise<string[]> {
    const held = await this.getHeldGrants(userId)
    return held.filter((h) => h.grant.scope === "album").map((h) => h.shortId)
  }

  async resolveHeldPhysicalMediaItem(
    userId: string,
    mediaKey: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): Promise<ResolvedPhysicalMediaItem | null> {
    const key = mediaKey.trim()
    if (!key) return null
    const held = await this.getHeldGrants(userId)
    const match = held.find(
      (h) => h.shortId === key && (h.grant.scope === "playlist" || h.grant.scope === "album"),
    )
    if (!match) return null
    const definition = catalogByShortId(this.grantCatalog).get(match.shortId)?.definition
    const item: PhysicalMediaItem = {
      mediaKey: match.shortId,
      name: match.name,
      ...physicalMediaArtworkFields(definition),
      ...(match.condition ? { condition: match.condition } : {}),
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
    if (!this.getContext()) return out

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
    const membershipByTrack = await this.membershipForTracks(
      uniqueIds,
      playlistIds,
      byAlbumId.size > 0,
    )

    const applyEntry = (
      id: string,
      entry: (typeof this.derivedPhysicalMedia)[number] | undefined,
    ) => {
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

    for (const id of uniqueIds) {
      const memberIds = membershipByTrack.get(id)
      if (!memberIds) continue
      let matched = false
      for (const memberId of memberIds.playlistIds) {
        if (applyEntry(id, byPlaylistId.get(memberId))) {
          matched = true
          break
        }
      }
      if (matched) continue
      for (const memberId of memberIds.albumIds) {
        if (applyEntry(id, byAlbumId.get(memberId))) break
      }
    }
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

    const room = await context.getRoom()
    if (room?.metadataSourceAccess?.local !== "restricted") return allowQueueRequest()

    const isAdmin = await context.api.isRoomAdmin(params.roomId, params.userId)
    if (isAdmin) {
      const session = await context.game.getActiveSession()
      const wearForAdmins = session?.config.physicalMediaWearForAdmins !== false
      if (!wearForAdmins) return allowQueueRequest()
    }

    const grants = config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const inv = await context.inventory.getInventory(params.userId)
    const items = inv.items
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items,
      grantCatalog: this.grantCatalog,
    })
    if (held.length === 0) {
      return rejectQueueRequest(LOCAL_LIBRARY_QUEUE_REJECT_REASON)
    }

    const playlistMap = this.playlistMap(grants)
    const albumMap = this.albumMap()
    const playlistHeld = held.filter((h) => h.grant.scope === "playlist")
    const albumHeld = held.filter((h) => h.grant.scope === "album")
    const playlistIdsForMembership = playlistHeld
      .map((h) => (h.grant.scope === "playlist" ? playlistMap[h.grant.playlistKey]?.trim() : ""))
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

    const durableMatches = matchingDurableRecords(held, trackInPlaylistKey, trackInAlbumKey)
    if (durableMatches.length > 0) {
      const needsDevice = durableMatches.filter(requiresPlaybackDevice)
      // A library card or operator grant covers the track outright.
      if (needsDevice.length < durableMatches.length) {
        await this.wearRecordForQueue(params, durableMatches, inv)
        return allowQueueRequest()
      }
      const devices = playableFormats(items)
      const playable = needsDevice.filter((h) => h.mediaFormat && devices.has(h.mediaFormat))
      if (playable.length === 0) {
        return rejectQueueRequest(PLAYBACK_DEVICE_MISSING_REASON)
      }
      await this.wearRecordForQueue(params, playable, inv)
      return allowQueueRequest()
    }

    const pick = pickGrantToConsume({ held, trackInPlaylistKey })
    if (!pick) {
      return rejectQueueRequest(LOCAL_LIBRARY_QUEUE_REJECT_REASON)
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

  /**
   * Degrade (or convert) the worst matching playlist/album record. Never rejects.
   * `matching` is already membership- and (when required) format-filtered.
   */
  private async wearRecordForQueue(
    params: QueueValidationParams,
    matching: HeldLocalLibraryGrant[],
    inv: UserInventory,
  ): Promise<void> {
    const context = this.getContext()
    if (!context) return

    const wearable = matching.filter((h) => h.grant.scope !== "library")
    if (wearable.length === 0) return

    const items = inv.items
    const byItemId = new Map(items.map((item) => [item.itemId, item]))
    const ranked = wearable
      .map((h) => {
        const item = byItemId.get(h.itemId)
        if (!item) return null
        return { held: h, item, condition: readItemCondition(item) }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
    ranked.sort((a, b) => {
      const wear = CONDITION_WEAR_RANK[b.condition] - CONDITION_WEAR_RANK[a.condition]
      if (wear !== 0) return wear
      return a.held.itemId.localeCompare(b.held.itemId)
    })
    const chosen = ranked[0]
    if (!chosen) return

    const next = degradeCondition(chosen.condition)
    const recordName = chosen.held.name
    if (next) {
      await context.inventory.updateItemMetadata(params.userId, chosen.held.itemId, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: next,
      })
      await context.api.sendUserToast(params.roomId, params.userId, {
        title: `${recordName} is now in ${MEDIA_CONDITION_LABELS[next]} condition.`,
        type: "info",
        source: "item-shops",
      })
      return
    }

    const broken = brokenMediaForRecord({
      mediaFormat: chosen.held.mediaFormat,
    })
    await context.inventory.removeItem(params.userId, chosen.held.itemId, 1, {
      degraded: true,
    })

    let given = null
    if (broken) {
      const remaining: UserInventory = {
        ...inv,
        items: inv.items.filter((item) => item.itemId !== chosen.held.itemId),
      }
      given = await context.inventory.giveItem(
        params.userId,
        definitionIdForShortId(this.pluginName, broken.shortId),
        1,
        { [PHYSICAL_MEDIA_ORIGIN_KEY]: chosen.held.definitionId },
        "plugin",
        remaining,
      )
      if (!given) {
        console.debug(
          `[${this.pluginName}] no inventory slot for broken media ${broken.shortId} after converting ${recordName}`,
        )
      }
    }
    const transition = broken?.transitionMessage(recordName) ?? `${recordName} wore out.`
    const woreOutLine = "You can no longer queue songs from it."
    const description =
      broken && !given ? `${woreOutLine} You had no room to keep the worn-out copy.` : woreOutLine
    await context.api.sendUserToast(params.roomId, params.userId, {
      title: transition,
      description,
      type: "warning",
      duration: 10_000,
      source: "item-shops",
    })
  }

  private async resolveUserLocalCatalogScope(
    userId: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): Promise<LocalCatalogScope> {
    const items = await this.getInventoryItems(userId)
    return resolveLocalCatalogScope({
      pluginName: this.pluginName,
      items,
      grantCatalog: this.grantCatalog,
      localLibraryPlaylists: this.playlistMap(grants),
      localLibraryAlbums: this.albumMap(),
    })
  }

  private async getInventoryItems(userId: string) {
    const context = this.getContext()
    if (!context) return []
    const inv = await context.inventory.getInventory(userId)
    return inv.items
  }

  private async getHeldGrants(userId: string): Promise<HeldLocalLibraryGrant[]> {
    const items = await this.getInventoryItems(userId)
    return listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items,
      grantCatalog: this.grantCatalog,
    })
  }

  /**
   * In-memory collection-pool Physical Media for random restore. Built from
   * `derivedPhysicalMedia` so a cleaner use never HGETALLs the definitions hash.
   */
  pickRandomRestoreCandidate(eligible: readonly PhysicalMediaFormat[]): ItemDefinition | null {
    const catalog = this.derivedPhysicalMedia.map((entry) => ({
      id: definitionIdForShortId(this.pluginName, entry.definition.shortId),
      sourcePlugin: this.pluginName,
      ...entry.definition,
    }))
    return pickRandomRestoreCandidateFromCatalog(catalog, eligible)
  }

  /**
   * Playlist/album membership for unique local track ids. Hits an in-process
   * memo first, then one batched daemon RPC (per-track fallback on old packs).
   */
  private async membershipForTracks(
    uniqueIds: string[],
    playlistIds: string[],
    includeTrackAlbumId: boolean,
  ): Promise<Map<string, { playlistIds: string[]; albumIds: string[] }>> {
    const out = new Map<string, { playlistIds: string[]; albumIds: string[] }>()
    const missing: string[] = []
    for (const id of uniqueIds) {
      const cached = this.sleeveMembershipMemo.get(id)
      if (cached) out.set(id, cached)
      else missing.push(id)
    }
    if (missing.length === 0) return out

    const context = this.getContext()
    if (!context) return out

    const fetched = await this.fetchMemberships(missing, playlistIds, includeTrackAlbumId)
    for (const [id, membership] of Array.from(fetched.entries())) {
      this.sleeveMembershipMemo.set(id, membership)
      out.set(id, membership)
    }
    return out
  }

  private async fetchMemberships(
    trackIds: string[],
    playlistIds: string[],
    includeTrackAlbumId: boolean,
  ): Promise<Map<string, { playlistIds: string[]; albumIds: string[] }>> {
    const context = this.getContext()
    const empty = new Map<string, { playlistIds: string[]; albumIds: string[] }>()
    if (!context || trackIds.length === 0) return empty

    const api = context.api
    if (typeof api.checkLocalTrackPlaylistMembershipBatch === "function") {
      return api.checkLocalTrackPlaylistMembershipBatch({
        roomId: context.roomId,
        trackIds,
        playlistIds,
        includeTrackAlbumId,
        firstMatch: true,
      })
    }

    const out = new Map<string, { playlistIds: string[]; albumIds: string[] }>()
    await Promise.all(
      trackIds.map(async (id) => {
        out.set(
          id,
          await api.checkLocalTrackPlaylistMembership({
            roomId: context.roomId,
            trackId: id,
            playlistIds,
            includeTrackAlbumId,
            firstMatch: true,
          }),
        )
      }),
    )
    return out
  }
}
