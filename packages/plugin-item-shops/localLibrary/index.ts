import {
  allowQueueRequest,
  parseArtworkFrame,
  rejectQueueRequest,
  type ItemDefinition,
  type LibraryAlbumRow,
  type PhysicalMediaFormat,
  type PhysicalMediaPick,
  type MetadataSourceAccessGrantParams,
  type UserInventory,
  type MetadataSourceAccessGrantResult,
  type PhysicalMediaItem,
  type PhysicalMediaNowPlayingFrame,
  type PluginContext,
  type QueueItem,
  type QueueValidationParams,
  type QueueValidationResult,
  type RecordAlbumRef,
  type ResolvedPhysicalMediaItem,
  type MediaCondition,
  type SharedPlayback,
  PHYSICAL_MEDIA_CONDITION_KEY,
  PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY,
} from "@repo/types"
import { brokenMediaConvertMetadata } from "@repo/game-logic"
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
import { CONDITION_WEAR_RANK, degradeCondition, readItemCondition } from "./condition"
import {
  convertWearToastDescription,
  intactWearToastDescription,
  intactWearToastTitle,
} from "./conditionMessaging"
import { brokenMediaForRecord } from "../items/shared/brokenMedia"
import { pickRandomRestoreCandidateFromCatalog } from "../items/shared/restoreMedia"
import {
  buildGrantCatalogEntries,
  catalogByShortId,
  definitionIdForShortId,
  isLocalLibraryGrantShortId,
  listHeldLocalLibraryGrants,
  listHeldSourceRecords,
  matchingDurableRecords,
  pickGrantToConsume,
  playlistMapFromGrantConfig,
  resolveLocalCatalogScope,
  LOCAL_LIBRARY_QUEUE_REJECT_REASON,
  type HeldLocalLibraryGrant,
  type HeldRecordCopy,
  type HeldSourceRecord,
  type LocalCatalogScope,
} from "./grants"
import { derivePickedRecord, pickKey, resolvePick, type ResolvedPick } from "./pickedRecords"
import type { PickStock } from "./physicalMediaStock"
import {
  PLAYBACK_DEVICE_MISSING_REASON,
  gentlePlayableFormats,
  playableFormats,
  requiresPlaybackDevice,
} from "./playbackDevices"
import {
  NO_SHARED_PLAYBACK,
  SHARED_PLAYBACK_KEY,
  sharedPlaybackFormats,
  withSharedPlayback,
  type SharedPlaybackEntries,
  type SharedPlaybackFormats,
} from "./sharedPlayback"

/** Resolved picks by record shortId (ADR 0216), so sold records outlive the stop. */
export const PICKED_RECORDS_KEY = "record-picks:v1"

/** What a request's picks can stock in this room (ADR 0216). */
export type PickAvailability = {
  total: number
  available: number
  /** "Artist – Title" for local picks with no match in this library. */
  unresolved: string[]
  /** Sources the room doesn't offer, with how many picks they cost. */
  unavailableSources: Record<string, number>
}

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
/** Map key for a record's album on its source. */
export function sourceAlbumKey(ref: RecordAlbumRef): string {
  return `${ref.sourceId}:${ref.albumId}`
}

/**
 * The album a non-local queued track sits on, read from the media source's own
 * track data (ADR 0216). Local tracks match by Navidrome membership instead.
 */
export function sourceAlbumOf(item: QueueItem): RecordAlbumRef | undefined {
  const sourceId = item.mediaSource?.type
  if (!sourceId || sourceId === "local") return undefined
  const enriched = item.metadataSources?.[sourceId as keyof typeof item.metadataSources]
  const primary =
    !item.metadataSource?.type || item.metadataSource.type === sourceId ? item.track : undefined
  const albumId = (enriched?.track.album?.id ?? primary?.album?.id)?.trim()
  return albumId ? { sourceId, albumId } : undefined
}

/** Now Playing sleeve for a record definition, or undefined without a frame. */
function nowPlayingFrameOf(
  definition: Pick<ItemDefinition, "artworkFrame" | "imageUrl" | "imageUrlLarge">,
): PhysicalMediaNowPlayingFrame | undefined {
  const artworkFrame = definition.artworkFrame
    ? parseArtworkFrame(definition.artworkFrame)
    : undefined
  if (!artworkFrame) return undefined
  const imageUrl = definition.imageUrl?.trim()
  const imageUrlLarge = definition.imageUrlLarge?.trim()
  return {
    artworkFrame,
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageUrlLarge ? { imageUrlLarge } : {}),
  }
}

export class LocalLibraryModule {
  grantCatalog: ItemCatalogEntry[] = ITEM_CATALOG.filter((e) => e.localLibraryGrant)
  derivedPhysicalMedia: ItemCatalogEntry[] = []
  /** Record SKUs for resolved picks (ADR 0216). */
  pickedRecords: ItemCatalogEntry[] = []
  private resolvedPicks = new Map<string, ResolvedPick>()
  /** pickKey → record shortId for picks that resolved. */
  private pickShortIds = new Map<string, string>()
  /** Metadata sources the room offers, refreshed when picks register. */
  private pickSources = new Set<string>()
  /** The room's library albums from the last refresh, for local pick matching. */
  private libraryAlbumsMemo: LibraryAlbumRow[] | null = null
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
    const grantCatalog = [
      ...staticGrants,
      ...configGrants,
      ...this.derivedPhysicalMedia,
      ...this.pickedRecords.filter((e) => e.localLibraryGrant),
    ]
    this.grantCatalog = grantCatalog
    return {
      itemCatalog: buildEffectiveItemCatalog(grants, this.derivedPhysicalMedia, this.pickedRecords),
      shopCatalog: buildEffectiveShopCatalog(grants, this.derivedPhysicalMedia, this.pickStock),
      grantCatalog,
    }
  }

  /** Shop stock for picks: resolved, from a source the room offers (ADR 0216). */
  readonly pickStock: PickStock = (picks) => {
    const byShortId = new Map(this.pickedRecords.map((e) => [e.definition.shortId, e] as const))
    const out: { shortId: string; coinValue: number }[] = []
    for (const pick of picks) {
      if (!this.pickSources.has(pick.source)) continue
      const shortId = this.pickShortIds.get(pickKey(pick))
      const entry = shortId ? byShortId.get(shortId) : undefined
      if (!entry) continue
      out.push({ shortId: entry.definition.shortId, coinValue: entry.definition.coinValue ?? 0 })
    }
    return out
  }

  pickAvailability(picks: readonly PhysicalMediaPick[]): PickAvailability {
    const unresolved: string[] = []
    const unavailableSources: Record<string, number> = {}
    let available = 0
    for (const pick of picks) {
      if (!this.pickSources.has(pick.source)) {
        unavailableSources[pick.source] = (unavailableSources[pick.source] ?? 0) + 1
      } else if (!this.pickShortIds.has(pickKey(pick))) {
        unresolved.push(`${pick.artist} – ${pick.title}`)
      } else {
        available++
      }
    }
    return { total: picks.length, available, unresolved, unavailableSources }
  }

  /** Load persisted picks so held picked records resolve after a restart. */
  async loadPickedRecords(): Promise<void> {
    const context = this.getContext()
    if (!context) return
    const { value } =
      await context.storage.getJson<Record<string, ResolvedPick>>(PICKED_RECORDS_KEY)
    this.resolvedPicks = new Map(Object.entries(value ?? {}))
    this.rebuildPickedRecords()
  }

  /**
   * Resolve picks against this room and keep their SKUs (ADR 0216). Re-derives
   * every pick so edited snapshots (lore, format) win. Returns whether any
   * record definition changed, so callers resync catalogs.
   */
  async registerPicks(picks: readonly PhysicalMediaPick[]): Promise<boolean> {
    const context = this.getContext()
    if (!context || picks.length === 0) return false
    const sources = await context.catalog.listMetadataSources(context.roomId)
    this.pickSources = new Set(sources.map((source) => source.id))

    const library = picks.some((pick) => pick.source === "local") ? await this.libraryAlbums() : []
    let changed = false
    for (const pick of picks) {
      const ref = resolvePick(pick, library)
      if (!ref) continue
      const entry = derivePickedRecord({ pick, ref })
      const shortId = entry.definition.shortId
      this.pickShortIds.set(pickKey(pick), shortId)
      const existing = this.resolvedPicks.get(shortId)
      if (existing && JSON.stringify(existing) === JSON.stringify({ pick, ref })) continue
      this.resolvedPicks.set(shortId, { pick, ref })
      changed = true
    }
    if (!changed) return false
    this.rebuildPickedRecords()
    await context.storage.setJson(PICKED_RECORDS_KEY, Object.fromEntries(this.resolvedPicks))
    return true
  }

  private rebuildPickedRecords(): void {
    const previous = new Map(this.pickedRecords.map((e) => [e.definition.shortId, e] as const))
    this.pickedRecords = [...this.resolvedPicks.values()].map((resolved) => {
      const entry = derivePickedRecord(resolved)
      const shortId = entry.definition.shortId
      this.pickShortIds.set(pickKey(resolved.pick), shortId)
      // Keep a hydrated local sleeve / lore across re-derivation.
      const prior = previous.get(shortId)?.definition
      if (!prior) return entry
      return {
        ...entry,
        definition: {
          ...entry.definition,
          ...(!entry.definition.imageUrl && prior.imageUrl ? { imageUrl: prior.imageUrl } : {}),
          ...(!entry.definition.imageUrlLarge && prior.imageUrlLarge
            ? { imageUrlLarge: prior.imageUrlLarge }
            : {}),
          ...(!entry.definition.lore && prior.lore ? { lore: prior.lore } : {}),
        },
      }
    })
  }

  /** The room's library albums: last refresh's, else one fetch (bridge rooms only). */
  private async libraryAlbums(): Promise<LibraryAlbumRow[]> {
    if (this.libraryAlbumsMemo) return this.libraryAlbumsMemo
    const context = this.getContext()
    if (!context) return []
    const room = await context.getRoom()
    if (room?.playbackControllerId !== "bridge") return []
    const albums = await context.catalog.listLibraryAlbums(context.roomId)
    if (albums.length > 0) this.libraryAlbumsMemo = albums
    return albums
  }

  /** Every record SKU sleeves and lore can patch: derived plus picked. */
  private recordEntries(): ItemCatalogEntry[] {
    return [...this.derivedPhysicalMedia, ...this.pickedRecords]
  }

  /** Navidrome album id behind a record shortId (derived album or local pick). */
  private localAlbumIdFor(entry: ItemCatalogEntry): string | undefined {
    const shortId = entry.definition.shortId
    const derived = this.derivedAlbumMap[shortId]?.trim()
    if (derived) return derived
    const album = entry.definition.mediaAlbum
    return entry.localLibraryGrant?.scope === "album" && album?.sourceId === "local"
      ? album.albumId
      : undefined
  }

  /** Apply `patch` to every derived and picked record with a local album. */
  private patchLocalAlbumRecords(
    patch: (entry: ItemCatalogEntry, albumId: string) => ItemCatalogEntry,
  ): string[] {
    const changed: string[] = []
    const apply = (entry: ItemCatalogEntry) => {
      const albumId = this.localAlbumIdFor(entry)
      if (!albumId) return entry
      const next = patch(entry, albumId)
      if (next !== entry) changed.push(entry.definition.shortId)
      return next
    }
    this.derivedPhysicalMedia = this.derivedPhysicalMedia.map(apply)
    this.pickedRecords = this.pickedRecords.map(apply)
    return changed
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
    this.libraryAlbumsMemo = null
    if (room?.playbackControllerId !== "bridge") {
      this.derivedPhysicalMedia = []
      this.derivedPlaylistMap = {}
      this.derivedAlbumMap = {}
      this.albumArtworkAttempted.clear()
      this.sleeveMembershipMemo.clear()
      return null
    }

    const playlists = derivePrefixedPlaylists
      ? await context.catalog.listLocalPlaylists(context.roomId)
      : []
    const mediaPlaylists = playlists.filter((p) => parsePhysicalMediaName(p.name) != null)
    const artwork =
      derivePrefixedPlaylists && mediaPlaylists.length > 0
        ? await context.catalog.getLocalPlaylistArtwork(
            context.roomId,
            mediaPlaylists.map((p) => p.id),
          )
        : {}

    const albums = deriveAlbums ? await context.catalog.listLibraryAlbums(context.roomId) : []
    if (albums.length > 0) this.libraryAlbumsMemo = albums

    let omitAlbumIds = new Set<string>()
    const albumRatingByPlaylistId: Record<string, number> = {}
    const albumGenresByPlaylistId: Record<string, string[]> = {}

    if (derivePrefixedPlaylists && deriveAlbums && mediaPlaylists.length > 0 && albums.length > 0) {
      const playlistNdIdToAlbumId = new Map<string, string>()
      const playlistRows = await mapWithConcurrency(
        mediaPlaylists,
        DEDUP_RPC_CONCURRENCY,
        async (pl) => {
          const ndId = pl.id.trim()
          if (!ndId) return null
          const trackRefs = await context.catalog.listLocalPlaylistTrackIds(context.roomId, ndId)
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
          const trackIds = await context.catalog.listLocalAlbumTrackIds(context.roomId, albumId)
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
        const album = albums.find((a) => a.id.trim() === albumId)
        if (album?.userRating != null) albumRatingByPlaylistId[playlistNdId] = album.userRating
        if (album?.genres?.length) albumGenresByPlaylistId[playlistNdId] = album.genres
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
        albumGenresByPlaylistId,
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
    for (const entry of this.recordEntries()) {
      const albumId = this.localAlbumIdFor(entry)
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
    return this.patchLocalAlbumRecords((entry, albumId) => {
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
      return {
        ...entry,
        definition: {
          ...entry.definition,
          ...(imageUrl ? { imageUrl } : {}),
          ...(imageUrlLarge ? { imageUrlLarge } : {}),
        },
      }
    })
  }

  /**
   * Patch derived album SKUs with lore from Navidrome's album-comment rollup.
   * `description` keeps the canned line. Returns changed shortIds.
   */
  applyAlbumLore(loreByAlbumId: Readonly<Record<string, string>>): string[] {
    return this.patchLocalAlbumRecords((entry, albumId) => {
      // A designer's lore on a pick wins over the album comment (ADR 0216).
      if (this.resolvedPicks.get(entry.definition.shortId)?.pick.lore) return entry
      const lore = loreByAlbumId[albumId]?.trim()
      if (!lore || entry.definition.lore === lore) return entry
      return { ...entry, definition: { ...entry.definition, lore } }
    })
  }

  /**
   * Sleeves and lore for one batch of album ids, fetched together so the
   * attempted set covers both.
   */
  private async fetchAlbumArtworkAndLore(
    context: PluginContext,
    albumIds: string[],
  ): Promise<string[]> {
    const [artwork, lore] = await Promise.all([
      context.catalog.getLocalAlbumArtwork(context.roomId, albumIds),
      context.catalog.getLocalAlbumComments(context.roomId, albumIds),
    ])
    return [...new Set([...this.applyAlbumArtwork(artwork), ...this.applyAlbumLore(lore)])]
  }

  /**
   * Fetch + apply sleeves and lore for specific derived album shortIds (shop
   * offers / held items). No-op for playlist SKUs and albums already fetched.
   */
  async ensureAlbumArtworkForShortIds(shortIds: readonly string[]): Promise<string[]> {
    const context = this.getContext()
    if (!context) return []
    const albumIds: string[] = []
    for (const raw of shortIds) {
      const shortId = raw.trim()
      if (!shortId) continue
      const entry = this.recordEntries().find((e) => e.definition.shortId === shortId)
      const albumId = entry ? this.localAlbumIdFor(entry) : undefined
      if (!entry || !albumId) continue
      if (entry.definition.imageUrl?.trim()) continue
      if (this.albumArtworkAttempted.has(albumId)) continue
      albumIds.push(albumId)
    }
    const unique = [...new Set(albumIds)]
    if (unique.length === 0) return []
    for (const id of unique) this.albumArtworkAttempted.add(id)
    return this.fetchAlbumArtworkAndLore(context, unique)
  }

  /**
   * Background fill of missing album sleeves and lore in batches. Call after
   * refresh so the catalog can register without waiting on the full library.
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
      const changed = await this.fetchAlbumArtworkAndLore(context, batch)
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
    const map = { ...this.derivedAlbumMap }
    for (const entry of this.pickedRecords) {
      const albumId = this.localAlbumIdFor(entry)
      if (albumId) map[entry.definition.shortId] = albumId
    }
    return map
  }

  async listPhysicalMediaItems(userId: string): Promise<PhysicalMediaItem[]> {
    const held = await this.getHeldGrants(userId)
    const byShort = catalogByShortId(this.grantCatalog)
    const derivedByShort = new Map(
      this.recordEntries().map((e) => [e.definition.shortId, e] as const),
    )
    const byMediaKey = new Map<string, PhysicalMediaItem>()
    const records = [
      ...held.filter((h) => h.grant.scope === "playlist" || h.grant.scope === "album"),
      ...(await this.getHeldSourceRecords(userId)),
    ]
    for (const h of records) {
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
    const sourceRecord = (await this.getHeldSourceRecords(userId)).find((h) => h.shortId === key)
    if (sourceRecord) {
      const definition = this.pickedRecords.find((e) => e.definition.shortId === key)?.definition
      return {
        kind: "album",
        albumId: sourceRecord.ref.albumId,
        sourceId: sourceRecord.ref.sourceId,
        item: {
          mediaKey: key,
          name: sourceRecord.name,
          ...physicalMediaArtworkFields(definition),
          ...(sourceRecord.condition ? { condition: sourceRecord.condition } : {}),
        },
      }
    }
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
    const picked = this.pickedRecords.find((e) => e.definition.shortId === key)
    if (picked?.recordAlbum) {
      return {
        kind: "album",
        albumId: picked.recordAlbum.albumId,
        sourceId: picked.recordAlbum.sourceId,
        item: {
          mediaKey: key,
          name: picked.definition.name,
          ...physicalMediaArtworkFields(picked.definition),
        },
      }
    }
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
    for (const entry of this.recordEntries()) {
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
      const albumNdId = this.localAlbumIdFor(entry)
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
      const frame = entry ? nowPlayingFrameOf(entry.definition) : undefined
      if (!frame) return false
      out.set(id, frame)
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

  /**
   * Sleeves for tracks on a non-local source, matched by album against picked
   * records' `recordAlbum` (ADR 0216). No RPC: the queued track already names
   * its album. Keyed by {@link sourceAlbumKey}; when several picks share an
   * album (LP and CD), the first by shortId wins.
   */
  resolveSourceRecordFrames(
    albums: readonly RecordAlbumRef[],
  ): Map<string, PhysicalMediaNowPlayingFrame> {
    const out = new Map<string, PhysicalMediaNowPlayingFrame>()
    if (albums.length === 0) return out
    const wanted = new Set(albums.map(sourceAlbumKey))
    const picks = [...this.pickedRecords].sort((a, b) =>
      a.definition.shortId.localeCompare(b.definition.shortId),
    )
    for (const entry of picks) {
      if (!entry.recordAlbum) continue
      const key = sourceAlbumKey(entry.recordAlbum)
      if (!wanted.has(key) || out.has(key)) continue
      const frame = nowPlayingFrameOf(entry.definition)
      if (frame) out.set(key, frame)
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
    if (params.sourceId !== "local") return this.grantSourceRecordAccess(params)
    const scope = await this.resolveUserLocalCatalogScope(
      params.userId,
      config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS,
    )
    return scope.mode === "none" ? "abstain" : "grant"
  }

  /**
   * A held picked record unlocks queueing its own album's tracks on a
   * restricted non-local source (ADR 0216). Search and track-less checks
   * abstain, so a record never opens the whole catalog.
   */
  private async grantSourceRecordAccess(
    params: MetadataSourceAccessGrantParams,
  ): Promise<MetadataSourceAccessGrantResult> {
    if (params.action !== "queue" || !params.trackId) return "abstain"
    const held = (await this.getHeldSourceRecords(params.userId)).filter(
      (h) => h.ref.sourceId === params.sourceId,
    )
    const covering = await this.recordsCoveringTrack(held, params.sourceId, params.trackId)
    return covering.length > 0 ? "grant" : "abstain"
  }

  /** Held source records whose album lists `trackId` (one listing per album). */
  private async recordsCoveringTrack(
    held: readonly HeldSourceRecord[],
    sourceId: string,
    trackId: string,
  ): Promise<HeldSourceRecord[]> {
    const context = this.getContext()
    if (!context || held.length === 0) return []
    const albumIds = [...new Set(held.map((h) => h.ref.albumId))]
    const covered = new Set<string>()
    await Promise.all(
      albumIds.map(async (albumId) => {
        const trackIds = await context.catalog.getAlbumTrackIds({
          roomId: context.roomId,
          sourceId,
          albumId,
        })
        if (trackIds.includes(trackId)) covered.add(albumId)
      }),
    )
    return held.filter((h) => covered.has(h.ref.albumId))
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

  /** `shopAccess.setSharedPlayback` (ADR 0215). Empty `formats` clears the owner. */
  async setSharedPlayback(ownerId: string, playback: SharedPlayback): Promise<void> {
    const context = this.getContext()
    if (!context) return
    const { value } = await context.storage.getJson<SharedPlaybackEntries>(SHARED_PLAYBACK_KEY)
    const next = withSharedPlayback(value ?? {}, ownerId, playback)
    if (Object.keys(next).length === 0) await context.storage.del(SHARED_PLAYBACK_KEY)
    else await context.storage.setJson(SHARED_PLAYBACK_KEY, next)
  }

  private async readSharedPlayback(): Promise<SharedPlaybackFormats> {
    const context = this.getContext()
    if (!context) return NO_SHARED_PLAYBACK
    const { value } = await context.storage.getJson<SharedPlaybackEntries>(SHARED_PLAYBACK_KEY)
    return value ? sharedPlaybackFormats(value) : NO_SHARED_PLAYBACK
  }

  async validateQueueRequest(
    params: QueueValidationParams,
    config: { enabled: boolean; localLibraryGrants?: LocalLibraryGrantConfig[] },
  ): Promise<QueueValidationResult> {
    const context = this.getContext()
    if (!context || !config.enabled) return allowQueueRequest()
    if (params.mediaSourceType !== "local") return this.validateSourceRecordQueue(params)

    const room = await context.getRoom()
    if (room?.metadataSourceAccess?.local !== "restricted") return allowQueueRequest()
    if (await this.adminSkipsRecordGate(params)) return allowQueueRequest()

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
      const memberIds = await context.catalog.checkLocalTrackPlaylistMembership({
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
      const shared = await this.readSharedPlayback()
      // A library card or operator grant covers the track outright.
      let snapshot: MediaCondition | undefined
      if (needsDevice.length < durableMatches.length) {
        snapshot = await this.wearRecordForQueue(params, durableMatches, inv, shared)
      } else {
        const devices = playableFormats(items, shared.formats)
        const playable = needsDevice.filter((h) => h.mediaFormat && devices.has(h.mediaFormat))
        if (playable.length === 0) {
          return rejectQueueRequest(PLAYBACK_DEVICE_MISSING_REASON)
        }
        snapshot = await this.wearRecordForQueue(params, playable, inv, shared)
      }
      if (snapshot) {
        return allowQueueRequest({
          [PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY]: { condition: snapshot },
        })
      }
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

  /** Admins skip record gating unless the session wears their records too. */
  private async adminSkipsRecordGate(params: QueueValidationParams): Promise<boolean> {
    const context = this.getContext()
    if (!context) return false
    if (!(await context.api.isRoomAdmin(params.roomId, params.userId))) return false
    const session = await context.game.getActiveSession()
    return session?.config.physicalMediaWearForAdmins === false
  }

  /**
   * Queueing from a restricted non-local source with a held picked record
   * (ADR 0216): same device check and wear as a library record. A track no
   * held record covers passes, so other plugins' grants still work.
   */
  private async validateSourceRecordQueue(
    params: QueueValidationParams,
  ): Promise<QueueValidationResult> {
    const context = this.getContext()
    const sourceId = params.mediaSourceType
    if (!context || !sourceId) return allowQueueRequest()
    const room = await context.getRoom()
    if (room?.playbackControllerId !== "bridge") return allowQueueRequest()
    if (room.metadataSourceAccess?.[sourceId] !== "restricted") return allowQueueRequest()
    if (await this.adminSkipsRecordGate(params)) return allowQueueRequest()

    const inv = await context.inventory.getInventory(params.userId)
    const held = listHeldSourceRecords({
      pluginName: this.pluginName,
      items: inv.items,
      catalog: this.pickedRecords,
    }).filter((h) => h.ref.sourceId === sourceId)
    const covering = await this.recordsCoveringTrack(held, sourceId, params.trackId)
    if (covering.length === 0) return allowQueueRequest()

    const shared = await this.readSharedPlayback()
    const devices = playableFormats(inv.items, shared.formats)
    const playable = covering.filter((h) => !h.mediaFormat || devices.has(h.mediaFormat))
    if (playable.length === 0) return rejectQueueRequest(PLAYBACK_DEVICE_MISSING_REASON)
    const snapshot = await this.wearRecordForQueue(params, playable, inv, shared)
    return snapshot
      ? allowQueueRequest({ [PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY]: { condition: snapshot } })
      : allowQueueRequest()
  }

  /**
   * Degrade (or convert) the worst matching playlist/album record. Never rejects.
   * `matching` is already membership- and (when required) format-filtered.
   * Returns the pre-wear condition snapshot for Now Playing (ADR 0165), or
   * undefined when nothing wearable was spent (library-scope only, or gentle
   * playback covered the format — ADR 0166).
   */
  private async wearRecordForQueue(
    params: QueueValidationParams,
    matching: HeldRecordCopy[],
    inv: UserInventory,
    shared: SharedPlaybackFormats,
  ): Promise<MediaCondition | undefined> {
    const context = this.getContext()
    if (!context) return undefined

    const wearable = matching.filter((h) => h.grant?.scope !== "library")
    if (wearable.length === 0) return undefined

    const gentle = gentlePlayableFormats(inv.items, shared.gentle)
    if (wearable.some((h) => h.mediaFormat != null && gentle.has(h.mediaFormat))) {
      return undefined
    }

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
    if (!chosen) return undefined

    const snapshot = chosen.condition
    const next = degradeCondition(chosen.condition)
    const recordName = chosen.held.name
    if (next) {
      await context.inventory.updateItemMetadata(params.userId, chosen.held.itemId, {
        [PHYSICAL_MEDIA_CONDITION_KEY]: next,
      })
      await context.api.sendUserToast(params.roomId, params.userId, {
        title: intactWearToastTitle(recordName, next),
        description: intactWearToastDescription(chosen.held.mediaFormat),
        type: next === "poor" ? "warning" : "info",
        source: "item-shops",
      })
      return snapshot
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
        brokenMediaConvertMetadata({
          originDefinitionId: chosen.held.definitionId,
          originRecordName: recordName,
        }),
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
    await context.api.sendUserToast(params.roomId, params.userId, {
      title: transition,
      description: convertWearToastDescription({
        brokenShortId: broken?.shortId,
        given: Boolean(given),
      }),
      type: "warning",
      duration: 10_000,
      source: "item-shops",
    })
    return snapshot
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

  private async getHeldSourceRecords(userId: string): Promise<HeldSourceRecord[]> {
    if (this.pickedRecords.length === 0) return []
    const items = await this.getInventoryItems(userId)
    return listHeldSourceRecords({
      pluginName: this.pluginName,
      items,
      catalog: this.pickedRecords,
    })
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

    const catalog = context.catalog
    if (typeof catalog.checkLocalTrackPlaylistMembershipBatch === "function") {
      return catalog.checkLocalTrackPlaylistMembershipBatch({
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
          await catalog.checkLocalTrackPlaylistMembership({
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
