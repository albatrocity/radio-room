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
   */
  async getEffectiveSourceIdsForUser(
    roomId: string,
    userId: string,
    action: MetadataSourceAccessAction,
  ): Promise<string[]> {
    const enabled = await this.getEnabledSourceIds(roomId)
    const allowed: string[] = []
    for (const sourceId of enabled) {
      if (await this.canAccess({ roomId, userId, sourceId, action })) {
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
  }): Promise<boolean> {
    const { roomId, userId, sourceId, action } = params
    const room = await findRoom({ context: this.context, roomId })
    if (!room) return false

    const enabled = await this.getEnabledSourceIds(roomId, room)
    if (!enabled.includes(sourceId)) return false

    // Non-bridge: no restricted baseline
    if (room.playbackControllerId !== "bridge") return true

    const admin = await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
    if (admin) return true

    const mode = room.metadataSourceAccess?.[sourceId] ?? "open"
    if (mode !== "restricted") return true

    return this.anyPluginGrants({ roomId, userId, sourceId, action })
  }

  /**
   * Playlist ids to pass into Local search/browse when the user has shelf-scoped grants.
   * Returns undefined for full library (admin, open, unrestricted coupon, or no filter).
   */
  async getLocalCatalogPlaylistIds(roomId: string, userId: string): Promise<string[] | undefined> {
    const room = await findRoom({ context: this.context, roomId })
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
      return filter.playlistIds.length > 0 ? filter.playlistIds : undefined
    } catch (e) {
      console.warn("[MetadataSourceAccess] local catalog filter failed:", e)
      return undefined
    }
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
        console.warn(
          "[MetadataSourceAccess] bridge capability filter failed; using policy set:",
          e,
        )
      }
    }

    return ids
  }
}
