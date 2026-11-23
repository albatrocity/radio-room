import { brokenMediaConvertMetadata } from "@repo/game-logic"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import {
  allowQueueRequest,
  rejectQueueRequest,
  PHYSICAL_MEDIA_CONDITION_KEY,
  PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY,
  type MediaCondition,
  type PluginContext,
  type QueueValidationParams,
  type QueueValidationResult,
  type UserInventory,
} from "@repo/types"
import { brokenMediaForRecord } from "../items/shared/brokenMedia"
import { CONDITION_WEAR_RANK, degradeCondition, readItemCondition } from "./condition"
import {
  convertWearToastDescription,
  intactWearToastDescription,
  intactWearToastTitle,
} from "./conditionMessaging"
import { DEFAULT_LOCAL_LIBRARY_GRANTS, type LocalLibraryGrantConfig } from "./config"
import {
  definitionIdForShortId,
  listHeldLocalLibraryGrants,
  listHeldSourceRecords,
  LOCAL_LIBRARY_QUEUE_REJECT_REASON,
  matchingDurableRecords,
  pickGrantToConsume,
  type HeldRecordCopy,
  type HeldSourceRecord,
} from "./grants"
import {
  PLAYBACK_DEVICE_MISSING_REASON,
  gentlePlayableFormats,
  playableFormats,
  requiresPlaybackDevice,
} from "./playbackDevices"
import type { SharedPlaybackFormats } from "./sharedPlayback"

/**
 * Readers queue redemption needs from `LocalLibraryModule`. Catalog refresh,
 * picks, and grants stay on the module.
 */
export type QueueValidationHost = {
  getContext: () => PluginContext | undefined
  pluginName: string
  grantCatalog: () => ItemCatalogEntry[]
  pickedRecords: () => ItemCatalogEntry[]
  playlistMap: (grants: readonly LocalLibraryGrantConfig[]) => Record<string, string>
  albumMap: () => Record<string, string>
  readSharedPlayback: () => Promise<SharedPlaybackFormats>
  recordsCoveringTrack: (
    held: readonly HeldSourceRecord[],
    sourceId: string,
    trackId: string,
  ) => Promise<HeldSourceRecord[]>
}

/** Queue gating, device checks, and record wear for local and picked albums. */
export class LocalLibraryQueueValidation {
  constructor(private readonly host: QueueValidationHost) {}

  async validateQueueRequest(
    params: QueueValidationParams,
    config: { enabled: boolean; localLibraryGrants?: LocalLibraryGrantConfig[] },
  ): Promise<QueueValidationResult> {
    const context = this.host.getContext()
    if (!context || !config.enabled) return allowQueueRequest()
    if (params.mediaSourceType !== "local") return this.validateSourceRecordQueue(params)

    const room = await context.getRoom()
    if (room?.metadataSourceAccess?.local !== "restricted") return allowQueueRequest()
    if (await this.adminSkipsRecordGate(params)) return allowQueueRequest()

    const grants = config.localLibraryGrants ?? DEFAULT_LOCAL_LIBRARY_GRANTS
    const inv = await context.inventory.getInventory(params.userId)
    const items = inv.items
    const held = listHeldLocalLibraryGrants({
      pluginName: this.host.pluginName,
      items,
      grantCatalog: this.host.grantCatalog(),
    })
    if (held.length === 0) {
      return rejectQueueRequest(LOCAL_LIBRARY_QUEUE_REJECT_REASON)
    }

    const playlistMap = this.host.playlistMap(grants)
    const albumMap = this.host.albumMap()
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
      const shared = await this.host.readSharedPlayback()
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
    const context = this.host.getContext()
    if (!context) return false
    if (!(await context.api.isRoomAdmin(params.roomId, params.userId))) return false
    const session = await context.game.getActiveSession()
    return session?.config.physicalMediaWearForAdmins === false
  }

  /**
   * Queueing from a restricted non-local source with a held picked record
   * (ADR 0224): same device check and wear as a library record. A track no
   * held record covers passes, so other plugins' grants still work.
   */
  private async validateSourceRecordQueue(
    params: QueueValidationParams,
  ): Promise<QueueValidationResult> {
    const context = this.host.getContext()
    const sourceId = params.mediaSourceType
    if (!context || !sourceId) return allowQueueRequest()
    const room = await context.getRoom()
    if (room?.playbackControllerId !== "bridge") return allowQueueRequest()
    if (room.metadataSourceAccess?.[sourceId] !== "restricted") return allowQueueRequest()
    if (await this.adminSkipsRecordGate(params)) return allowQueueRequest()

    const inv = await context.inventory.getInventory(params.userId)
    const held = listHeldSourceRecords({
      pluginName: this.host.pluginName,
      items: inv.items,
      catalog: this.host.pickedRecords(),
    }).filter((h) => h.ref.sourceId === sourceId)
    const covering = await this.host.recordsCoveringTrack(held, sourceId, params.trackId)
    if (covering.length === 0) return allowQueueRequest()

    const shared = await this.host.readSharedPlayback()
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
    const context = this.host.getContext()
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
        definitionIdForShortId(this.host.pluginName, broken.shortId),
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
          `[${this.host.pluginName}] no inventory slot for broken media ${broken.shortId} after converting ${recordName}`,
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
}
