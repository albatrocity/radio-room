import type { PluginContext, User } from "@repo/types"
import {
  FAMILY_PHOTO_DURATION_MS,
  FAMILY_PHOTO_MAX_DEPTH,
  FAMILY_PHOTO_PERSONA_SHORT_ID,
  SON_FUNNEL_CLAWBACK_REASON,
  SON_FUNNEL_REASON,
  SON_MIRROR_SKIP_SHORT_IDS,
} from "../items/family-photo/constants"
import { sonDepthFromUsername, sonUsernameFor } from "../items/family-photo/sonUsername"
import { flavorSonChatMessage } from "../items/family-photo/sonChatFlavor"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../items/shared/resolveItemUseActorDisplayName"
import type { ItemShopsBehaviorDeps } from "../items/shared/types"

export type SonSpawnRecord = {
  sonUserId: string
  parentUserId: string
  depth: number
  expiresAt: number
}

export const FAMILY_PHOTO_SONS_STORAGE_KEY = "family-photo-sons"
export const FAMILY_PHOTO_SON_DESPAWN_KIND = "family-photo-son-despawn"

type ScheduleApi = {
  scheduleDespawn: (
    sonUserId: string,
    durationMs: number,
  ) => Promise<{ ok: true; fireAt: number } | { ok: false; message: string }>
  cancelDespawn: (sonUserId: string) => Promise<boolean>
}

/**
 * Spawn graph + mirror helpers for Family Photo (ADR 0194).
 * Graph is persisted in plugin storage; despawn uses durable schedules (ADR 0190).
 */
export class SonRegistry {
  private bySonId = new Map<string, SonSpawnRecord>()
  private childrenByParent = new Map<string, Set<string>>()

  constructor(
    private readonly getContext: () => PluginContext | undefined,
    private readonly scheduleApi: ScheduleApi,
    private readonly pluginName: string,
  ) {}

  getChildUserIds(parentUserId: string): string[] {
    return Array.from(this.childrenByParent.get(parentUserId) ?? [])
  }

  listAllSonIds(): string[] {
    return Array.from(this.bySonId.keys())
  }

  isSon(userId: string): boolean {
    return this.bySonId.has(userId)
  }

  getRecord(sonUserId: string): SonSpawnRecord | undefined {
    return this.bySonId.get(sonUserId)
  }

  getParentUserId(sonUserId: string): string | undefined {
    return this.bySonId.get(sonUserId)?.parentUserId
  }

  /** Schedule id for a son's despawn (shared with ItemShopsPlugin.onScheduled). */
  static despawnScheduleId(sonUserId: string): string {
    return `family-photo-son-despawn:${sonUserId}`
  }

  async spawnSonForUser(parentUserId: string): Promise<{
    success: boolean
    consumed: boolean
    message: string
    son?: User
  }> {
    const context = this.getContext()
    if (!context) {
      return { success: false, consumed: false, message: "Plugin not initialized" }
    }

    const users = await context.api.getUsers(context.roomId)
    const parent = users.find((u) => u.userId === parentUserId)
    if (!parent) {
      return { success: false, consumed: false, message: "You must be in the room to use this." }
    }

    const parentUsername = parent.username ?? parentUserId
    const parentDepth = this.bySonId.get(parentUserId)?.depth ?? sonDepthFromUsername(parentUsername)
    const nextDepth = parentDepth + 1
    if (nextDepth > FAMILY_PHOTO_MAX_DEPTH) {
      return {
        success: false,
        consumed: false,
        message: "The family tree can't go any deeper.",
      }
    }

    const username = sonUsernameFor(parentUsername)
    const son = await context.api.spawnEphemeralUser(context.roomId, { username })
    await context.personas.assign(son.userId, FAMILY_PHOTO_PERSONA_SHORT_ID, this.pluginName)

    const expiresAt = Date.now() + FAMILY_PHOTO_DURATION_MS
    const record: SonSpawnRecord = {
      sonUserId: son.userId,
      parentUserId,
      depth: nextDepth,
      expiresAt,
    }
    this.addRecord(record)
    await this.persistGraph()

    await this.scheduleApi.scheduleDespawn(son.userId, FAMILY_PHOTO_DURATION_MS)

    const deps: ItemShopsBehaviorDeps = {
      pluginName: this.pluginName,
      context,
      game: context.game,
    }
    const actor = await resolveItemUseActorDisplayName(deps, parentUserId)
    await sendAttributedSystemMessage(
      deps,
      `${actor.label} brought their son into the picture.`,
      actor,
    )

    return {
      success: true,
      consumed: true,
      message: `${username} is in the picture for 10 minutes.`,
      son,
    }
  }

  async despawnSon(sonUserId: string): Promise<void> {
    const context = this.getContext()
    const record = this.bySonId.get(sonUserId)
    if (!record) {
      await this.scheduleApi.cancelDespawn(sonUserId)
      return
    }

    // Despawn descendants first
    const children = this.getChildUserIds(sonUserId)
    for (const childId of children) {
      await this.despawnSon(childId)
    }

    await this.scheduleApi.cancelDespawn(sonUserId)
    this.removeRecord(sonUserId)
    await this.persistGraph()

    if (!context) return

    try {
      await context.personas.remove(sonUserId, FAMILY_PHOTO_PERSONA_SHORT_ID)
    } catch {
      // Persona may already be gone
    }
    await context.api.despawnEphemeralUser(context.roomId, sonUserId)
  }

  /** When a parent leaves, despawn their entire son subtree. */
  async onUserLeft(userId: string): Promise<void> {
    if (this.bySonId.has(userId)) {
      await this.despawnSon(userId)
      return
    }
    const children = this.getChildUserIds(userId)
    for (const childId of [...children]) {
      await this.despawnSon(childId)
    }
  }

  async mirrorChat(parentUserId: string, content: string): Promise<void> {
    const context = this.getContext()
    if (!context) return
    const children = this.getChildUserIds(parentUserId)
    const now = Date.now()
    for (const childId of children) {
      try {
        const record = this.getRecord(childId)
        const flavored = flavorSonChatMessage(content, {
          remainingMs: Math.max(0, (record?.expiresAt ?? now) - now),
          totalMs: FAMILY_PHOTO_DURATION_MS,
        })
        await context.api.sendChatMessageAsUser(context.roomId, childId, flavored)
      } catch (e) {
        console.error(`[${this.pluginName}] son chat mirror failed for ${childId}:`, e)
      }
    }
  }

  async mirrorReactionAdded(
    parentUserId: string,
    emoji: Parameters<PluginContext["api"]["addReactionAsUser"]>[2],
    reactTo: Parameters<PluginContext["api"]["addReactionAsUser"]>[3],
  ): Promise<void> {
    const context = this.getContext()
    if (!context) return
    for (const childId of this.getChildUserIds(parentUserId)) {
      try {
        await context.api.addReactionAsUser(context.roomId, childId, emoji, reactTo)
      } catch (e) {
        console.error(`[${this.pluginName}] son reaction mirror failed for ${childId}:`, e)
      }
    }
  }

  async mirrorReactionRemoved(
    parentUserId: string,
    emoji: Parameters<PluginContext["api"]["removeReactionAsUser"]>[2],
    reactTo: Parameters<PluginContext["api"]["removeReactionAsUser"]>[3],
  ): Promise<void> {
    const context = this.getContext()
    if (!context) return
    for (const childId of this.getChildUserIds(parentUserId)) {
      try {
        await context.api.removeReactionAsUser(context.roomId, childId, emoji, reactTo)
      } catch (e) {
        console.error(`[${this.pluginName}] son reaction remove mirror failed for ${childId}:`, e)
      }
    }
  }

  async mirrorInventoryAcquired(params: {
    parentUserId: string
    definitionId: string
    quantity: number
    metadata?: Record<string, unknown>
    shortId?: string
  }): Promise<void> {
    const context = this.getContext()
    if (!context) return
    if (params.shortId && SON_MIRROR_SKIP_SHORT_IDS.has(params.shortId)) return

    for (const childId of this.getChildUserIds(params.parentUserId)) {
      try {
        await context.inventory.giveItem(
          childId,
          params.definitionId,
          params.quantity,
          params.metadata,
          "plugin",
        )
      } catch (e) {
        console.error(`[${this.pluginName}] son inventory acquire mirror failed for ${childId}:`, e)
      }
    }
  }

  async mirrorInventoryUsed(params: {
    parentUserId: string
    definitionId: string
    callContext?: unknown
  }): Promise<void> {
    const context = this.getContext()
    if (!context) return

    for (const childId of this.getChildUserIds(params.parentUserId)) {
      try {
        const inv = await context.inventory.getInventory(childId)
        const stack = inv.items.find(
          (i) => i.definitionId === params.definitionId && i.quantity > 0,
        )
        if (!stack) continue
        await context.inventory.useItem(childId, stack.itemId, params.callContext)
      } catch (e) {
        console.error(`[${this.pluginName}] son inventory use mirror failed for ${childId}:`, e)
      }
    }
  }

  async funnelScore(params: {
    sonUserId: string
    attribute: "coin" | "score"
    previousValue: number
    value: number
    reason?: string
  }): Promise<void> {
    const context = this.getContext()
    if (!context) return
    if (
      params.reason === SON_FUNNEL_REASON ||
      params.reason === SON_FUNNEL_CLAWBACK_REASON
    ) {
      return
    }

    const parentUserId = this.getParentUserId(params.sonUserId)
    if (!parentUserId) return

    const previous = params.previousValue ?? 0
    const delta = params.value - previous
    if (delta <= 0) return

    await context.game.addScore(parentUserId, params.attribute, delta, SON_FUNNEL_REASON, {
      intent: "exact",
    })
    await context.game.addScore(
      params.sonUserId,
      params.attribute,
      -delta,
      SON_FUNNEL_CLAWBACK_REASON,
      { intent: "exact" },
    )
  }

  /**
   * Reload persisted graph after process restart: despawn due records, reschedule
   * remaining lifetimes, and remove persona holders missing from the graph.
   */
  async reconcileOnRegister(now = Date.now()): Promise<void> {
    const context = this.getContext()
    if (!context) return

    const { value } = await context.storage.getJson<SonSpawnRecord[]>(FAMILY_PHOTO_SONS_STORAGE_KEY)
    const records = Array.isArray(value) ? value : []

    this.bySonId.clear()
    this.childrenByParent.clear()
    for (const record of records) {
      this.addRecord(record)
    }

    // Schedule minimum is 1s (ADR 0190); treat due-or-imminent as immediate despawn.
    const dueIds = records
      .filter((r) => r.expiresAt <= now + 1000)
      .map((r) => r.sonUserId)
    for (const sonUserId of dueIds) {
      await this.despawnSon(sonUserId)
    }

    for (const record of [...this.bySonId.values()]) {
      const remaining = Math.max(1000, record.expiresAt - now)
      await this.scheduleApi.scheduleDespawn(record.sonUserId, remaining)
    }

    // Orphans: persona holders with no graph record (crash between spawn and persist).
    const holders = await context.personas.getUsersWithPersona(FAMILY_PHOTO_PERSONA_SHORT_ID)
    for (const userId of holders) {
      if (this.bySonId.has(userId)) continue
      try {
        await context.personas.remove(userId, FAMILY_PHOTO_PERSONA_SHORT_ID)
      } catch {
        // already gone
      }
      await context.api.despawnEphemeralUser(context.roomId, userId)
    }
  }

  async clearAll(): Promise<void> {
    for (const sonUserId of Array.from(this.bySonId.keys())) {
      await this.scheduleApi.cancelDespawn(sonUserId)
    }
    this.bySonId.clear()
    this.childrenByParent.clear()
    await this.persistGraph()
  }

  private async persistGraph(): Promise<void> {
    const context = this.getContext()
    if (!context) return
    const records = Array.from(this.bySonId.values())
    await context.storage.setJson(FAMILY_PHOTO_SONS_STORAGE_KEY, records)
  }

  private addRecord(record: SonSpawnRecord): void {
    this.bySonId.set(record.sonUserId, record)
    let set = this.childrenByParent.get(record.parentUserId)
    if (!set) {
      set = new Set()
      this.childrenByParent.set(record.parentUserId, set)
    }
    set.add(record.sonUserId)
  }

  private removeRecord(sonUserId: string): void {
    const record = this.bySonId.get(sonUserId)
    if (!record) return
    this.bySonId.delete(sonUserId)
    const set = this.childrenByParent.get(record.parentUserId)
    if (set) {
      set.delete(sonUserId)
      if (set.size === 0) this.childrenByParent.delete(record.parentUserId)
    }
  }
}
