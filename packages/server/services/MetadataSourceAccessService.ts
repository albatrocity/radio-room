import type {
  AppContext,
  MetadataSourceAccessAction,
  MetadataSourceCatalogEntry,
  Room,
} from "@repo/types"
import { labelForMetadataSource } from "@repo/types"
import { filterMetadataSourcesByBridgeCapability } from "@repo/utils"
import { findRoom, isRoomAdmin } from "../operations/data"

/**
 * Evaluates who may search/queue metadata sources on bridge rooms (ADR 0088).
 * Availability (policy ∩ CAPABILITIES) stays in 0087; this layer adds open/restricted + plugin grants.
 */
export class MetadataSourceAccessService {
  constructor(private readonly context: AppContext) {}

  /**
   * Room catalog for plugins: policy ∩ CAPABILITIES (not per-user).
   */
  async listMetadataSources(roomId: string): Promise<MetadataSourceCatalogEntry[]> {
    const enabled = await this.getEnabledSourceIds(roomId)
    return enabled.map((id) => ({ id, label: labelForMetadataSource(id) }))
  }

  /**
   * Per-user effective source ids for search tabs / fan-out.
   *
   * Pass `room` when the caller already loaded it; every source is then decided
   * against that one snapshot instead of re-reading the room per source.
   */
  async getEffectiveSourceIdsForUser(
    roomId: string,
    userId: string,
    action: MetadataSourceAccessAction,
    room?: Room | null,
  ): Promise<string[]> {
    const resolved = room ?? (await findRoom({ context: this.context, roomId }))
    if (!resolved) return []

    const enabled = await this.getEnabledSourceIds(roomId, resolved)
    const evaluate = this.buildAccessEvaluator({ room: resolved, roomId, userId, enabled })

    const allowed: string[] = []
    for (const sourceId of enabled) {
      if (await evaluate(sourceId, action)) {
        allowed.push(sourceId)
      }
    }
    return allowed
  }

  async canAccess(params: {
    roomId: string
    userId: string
    sourceId: string
    action: MetadataSourceAccessAction
    room?: Room | null
  }): Promise<boolean> {
    const { roomId, userId, sourceId, action } = params
    const room = params.room ?? (await findRoom({ context: this.context, roomId }))
    if (!room) return false

    const enabled = await this.getEnabledSourceIds(roomId, room)
    return this.buildAccessEvaluator({ room, roomId, userId, enabled })(sourceId, action)
  }

  /**
   * Decides one or many sources against a single room snapshot, resolving the
   * admin lookup at most once per call.
   */
  private buildAccessEvaluator(params: {
    room: Room
    roomId: string
    userId: string
    enabled: string[]
  }): (sourceId: string, action: MetadataSourceAccessAction) => Promise<boolean> {
    const { room, roomId, userId, enabled } = params
    let adminLookup: Promise<boolean> | undefined
    const isAdmin = () =>
      (adminLookup ??= isRoomAdmin({
        context: this.context,
        roomId,
        userId,
        roomCreator: room.creator,
      }))

    return async (sourceId, action) => {
      if (!enabled.includes(sourceId)) return false

      // Non-bridge: no restricted baseline
      if (room.playbackControllerId !== "bridge") return true

      if (await isAdmin()) return true

      const mode = room.metadataSourceAccess?.[sourceId] ?? "open"
      if (mode !== "restricted") return true

      return this.anyPluginGrants({ roomId, userId, sourceId, action })
    }
  }

  /**
   * Catalog shelves to pass into Local search/browse when the user has scoped grants.
   * Returns undefined for full library (admin, open, unrestricted coupon, or no filter).
   * Either playlistIds or albumIds (or both) may be non-empty; empty playlistIds alone
   * with non-empty albumIds is still a filter (must not fall through to unrestricted).
   *
   * Pass `room` when already loaded; non-bridge rooms then cost nothing.
   */
  async getLocalCatalogShelves(
    roomId: string,
    userId: string,
    preloadedRoom?: Room | null,
  ): Promise<{ playlistIds: string[]; albumIds: string[] } | undefined> {
    const room = preloadedRoom ?? (await findRoom({ context: this.context, roomId }))
    if (!room || room.playbackControllerId !== "bridge") return undefined

    const admin = await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
    if (admin) return undefined

    const mode = room.metadataSourceAccess?.local ?? "open"
    if (mode !== "restricted") return undefined

    const registry = this.context.pluginRegistry
    if (!registry?.resolveLocalLibraryCatalogFilter) return undefined
    try {
      const filter = await registry.resolveLocalLibraryCatalogFilter({ roomId, userId })
      if (!filter) return undefined
      if (filter.mode === "unrestricted") return undefined
      const playlistIds = filter.playlistIds.filter((id) => id.trim())
      const albumIds = (filter.albumIds ?? []).filter((id) => id.trim())
      if (playlistIds.length === 0 && albumIds.length === 0) return undefined
      return { playlistIds, albumIds }
    } catch (e) {
      console.warn("[MetadataSourceAccess] local catalog filter failed:", e)
      return undefined
    }
  }

  /** @deprecated Prefer {@link getLocalCatalogShelves}. Playlist-only view for callers not yet album-aware. */
  async getLocalCatalogPlaylistIds(
    roomId: string,
    userId: string,
    preloadedRoom?: Room | null,
  ): Promise<string[] | undefined> {
    const shelves = await this.getLocalCatalogShelves(roomId, userId, preloadedRoom)
    if (!shelves) return undefined
    // Album-only shelves must not look like "no filter" — return empty array is wrong for
    // playlist-only callers; they should migrate to getLocalCatalogShelves.
    if (shelves.playlistIds.length === 0 && shelves.albumIds.length > 0) {
      return []
    }
    return shelves.playlistIds.length > 0 ? shelves.playlistIds : undefined
  }

  private async anyPluginGrants(params: {
    roomId: string
    userId: string
    sourceId: string
    action: MetadataSourceAccessAction
  }): Promise<boolean> {
    const registry = this.context.pluginRegistry
    if (!registry?.grantMetadataSourceAccess) return false
    try {
      return await registry.grantMetadataSourceAccess(params)
    } catch (e) {
      console.warn("[MetadataSourceAccess] grant aggregation failed:", e)
      return false
    }
  }

  async getEnabledSourceIds(roomId: string, room?: Room | null): Promise<string[]> {
    const resolved = room ?? (await findRoom({ context: this.context, roomId }))
    if (!resolved?.metadataSourceIds?.length) return []

    let ids = [...resolved.metadataSourceIds]

    if (resolved.playbackControllerId === "bridge") {
      try {
        const { getOrCreateCapabilityCache } = await import("@repo/adapter-bridge")
        const capability = getOrCreateCapabilityCache(this.context.redis.pubClient, roomId)
        await capability.start()
        ids = filterMetadataSourcesByBridgeCapability({
          metadataSourceIds: ids,
          bridgeConnected: capability.isConnected(),
          capabilitiesKnown: capability.hasReceivedCapabilities(),
          availableServices: capability.getAvailableServices(),
        })
      } catch (e) {
        console.warn("[MetadataSourceAccess] bridge capability filter failed; using policy set:", e)
      }
    }

    return ids
  }
}
