import {
  allowQueueRequest,
  parseArtworkFrame,
  rejectQueueRequest,
  type MetadataSourceAccessGrantParams,
  type MetadataSourceAccessGrantResult,
  type MyMediaShelf,
  type PhysicalMediaNowPlayingFrame,
  type PluginContext,
  type QueueValidationParams,
  type QueueValidationResult,
} from "@repo/types"
import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "../items/index"
import {
  DEFAULT_LOCAL_LIBRARY_GRANTS,
  type LocalLibraryGrantConfig,
  type PhysicalMediaOverride,
} from "./config"
import { buildEffectiveItemCatalog, buildEffectiveShopCatalog } from "./catalog"
import { derivePhysicalMediaItems, parsePhysicalMediaName } from "./physicalMedia"
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

function shelfArtworkFields(definition?: ItemCatalogEntry["definition"]): {
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

  async refreshDerivedPhysicalMedia(overrides: readonly PhysicalMediaOverride[] = []): Promise<{
    itemCatalog: ItemCatalogEntry[]
    shopCatalog: ItemShopsShopCatalogEntry[]
    grantCatalog: ItemCatalogEntry[]
  } | null> {
    const context = this.getContext()
    if (!context) return null
    const room = await context.getRoom()
    if (room?.playbackControllerId !== "bridge") {
      this.derivedPhysicalMedia = []
      this.derivedPlaylistMap = {}
      return null
    }
    const playlists = await context.api.listLocalPlaylists(context.roomId)
    const mediaPlaylistIds = playlists
      .filter((p) => parsePhysicalMediaName(p.name) != null)
      .map((p) => p.id)
    const artwork =
      mediaPlaylistIds.length > 0
        ? await context.api.getLocalPlaylistArtwork(context.roomId, mediaPlaylistIds)
        : {}
    const derived = derivePhysicalMediaItems(playlists, overrides, artwork)
    this.derivedPhysicalMedia = derived.items
    this.derivedPlaylistMap = derived.playlistMap
    return null
  }

  isGrantShortId(shortId: string): boolean {
    return isLocalLibraryGrantShortId(shortId, this.grantCatalog)
  }

  playlistMap(grants: readonly LocalLibraryGrantConfig[]): Record<string, string> {
    return { ...playlistMapFromGrantConfig(grants), ...this.derivedPlaylistMap }
  }

  async listMyMediaShelves(userId: string): Promise<MyMediaShelf[]> {
    const context = this.getContext()
    if (!context) return []
    const inv = await context.inventory.getInventory(userId)
    const held = listHeldLocalLibraryGrants({
      pluginName: this.pluginName,
      items: inv.items,
      grantCatalog: this.grantCatalog,
    })
    const byShort = catalogByShortId(this.grantCatalog)
    const seen = new Set<string>()
    const shelves: MyMediaShelf[] = []
    for (const h of held) {
      if (h.grant.scope !== "playlist") continue
      if (seen.has(h.shortId)) continue
      seen.add(h.shortId)
      const definition = byShort.get(h.shortId)?.definition
      shelves.push({
        mediaKey: h.shortId,
        name: h.name,
        ...shelfArtworkFields(definition),
      })
    }
    return shelves
  }

  async resolveHeldMediaShelf(
    userId: string,
    mediaKey: string,
    grants: readonly LocalLibraryGrantConfig[],
  ): Promise<{ playlistId: string; shelf: MyMediaShelf } | null> {
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
    const match = held.find((h) => h.shortId === key && h.grant.scope === "playlist")
    if (!match || match.grant.scope !== "playlist") return null
    const playlistId = this.playlistMap(grants)[match.grant.playlistKey]?.trim()
    if (!playlistId) return null
    const definition = catalogByShortId(this.grantCatalog).get(match.shortId)?.definition
    return {
      playlistId,
      shelf: {
        mediaKey: match.shortId,
        name: match.name,
        ...shelfArtworkFields(definition),
      },
    }
  }

  /**
   * If these Local tracks belong to a derived Physical Media playlist, return
   * the sleeve for each. Playlist cover is optional; the client fills the frame
   * with track album art when `imageUrl` is missing. Duplicate ids share one RPC.
   */
  async resolveNowPlayingFrames(
    trackIds: readonly string[],
  ): Promise<Map<string, PhysicalMediaNowPlayingFrame>> {
    const out = new Map<string, PhysicalMediaNowPlayingFrame>()
    const context = this.getContext()
    if (!context) return out

    const byPlaylistId = new Map<string, (typeof this.derivedPhysicalMedia)[number]>()
    const playlistIds: string[] = []
    for (const entry of this.derivedPhysicalMedia) {
      const artworkFrame = entry.definition.artworkFrame
        ? parseArtworkFrame(entry.definition.artworkFrame)
        : undefined
      const ndId = this.derivedPlaylistMap[entry.definition.shortId]?.trim()
      if (!artworkFrame || !ndId) continue
      playlistIds.push(ndId)
      byPlaylistId.set(ndId, entry)
    }
    if (playlistIds.length === 0) return out

    const uniqueIds = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))]
    await Promise.all(
      uniqueIds.map(async (id) => {
        const memberIds = await context.api.checkLocalTrackPlaylistMembership({
          roomId: context.roomId,
          trackId: id,
          playlistIds,
        })
        for (const memberId of memberIds) {
          const entry = byPlaylistId.get(memberId)
          const artworkFrame = entry?.definition.artworkFrame
            ? parseArtworkFrame(entry.definition.artworkFrame)
            : undefined
          if (!artworkFrame) continue
          const imageUrl = entry?.definition.imageUrl?.trim()
          const imageUrlLarge = entry?.definition.imageUrlLarge?.trim()
          out.set(id, {
            artworkFrame,
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageUrlLarge ? { imageUrlLarge } : {}),
          })
          return
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
    | { mode: "playlists"; playlistIds: string[] }
    | "abstain"
  > {
    if (!this.getContext() || !params.enabled) return "abstain"
    const scope = await this.resolveUserLocalCatalogScope(params.userId, params.grants)
    if (scope.mode === "none") return "abstain"
    if (scope.mode === "unrestricted") return { mode: "unrestricted" }
    return { mode: "playlists", playlistIds: scope.playlistIds }
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
    const shelfHeld = held.filter((h) => h.grant.scope === "playlist")
    const playlistIdsForMembership = shelfHeld
      .map((h) =>
        h.grant.scope === "playlist" ? playlistMap[h.grant.playlistKey]?.trim() : "",
      )
      .filter((id): id is string => Boolean(id))

    const trackInPlaylistKey: Record<string, boolean> = {}
    if (playlistIdsForMembership.length > 0) {
      const memberIds = await context.api.checkLocalTrackPlaylistMembership({
        roomId: params.roomId,
        trackId: params.trackId,
        playlistIds: playlistIdsForMembership,
      })
      const memberSet = new Set(memberIds)
      for (const h of shelfHeld) {
        if (h.grant.scope !== "playlist") continue
        const ndId = playlistMap[h.grant.playlistKey]?.trim()
        trackInPlaylistKey[h.grant.playlistKey] = Boolean(ndId && memberSet.has(ndId))
      }
    } else {
      for (const h of shelfHeld) {
        if (h.grant.scope === "playlist") {
          trackInPlaylistKey[h.grant.playlistKey] = false
        }
      }
    }

    const coveredByDurable = held.some((h) => {
      if (h.grant.redemption !== "durable") return false
      if (h.grant.scope === "library") return true
      return h.grant.scope === "playlist" && trackInPlaylistKey[h.grant.playlistKey] === true
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
    })
  }
}
