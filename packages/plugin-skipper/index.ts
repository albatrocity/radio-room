import type {
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginComponentState,
  PluginConfigSchema,
  PluginContext,
  QueueItem,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  EMPTY_SKIPPER_STORE,
  SKIPPER_PERSONA_FULL_ID,
  SKIPPER_PERSONA_ID,
  SKIPPER_PLUGIN_NAME,
  defaultSkipperConfig,
  skipCountKey,
  skipperConfigSchema,
  type SkipperConfig,
  type SkipperStore,
} from "./types"

export type { SkipperConfig, SkipperStore } from "./types"
export {
  skipperConfigSchema,
  defaultSkipperConfig,
  SKIPPER_PLUGIN_NAME,
  SKIPPER_PERSONA_ID,
  SKIPPER_PERSONA_FULL_ID,
} from "./types"

type SkipCheck =
  | { ok: true; nowPlaying: QueueItem; autoAdvance: boolean }
  | { ok: false; message: string }

/**
 * Skipper (ADR 0206): admins assign the Skipper persona; holders may skip the
 * current track while another track is waiting in an app-controlled queue.
 * With queue auto-advance off, a skip pauses the current track instead.
 */
export class SkipperPlugin extends BasePlugin<SkipperConfig> {
  name = SKIPPER_PLUGIN_NAME
  version = packageJson.version
  description =
    "Admin-assigned Skipper persona that may skip the current track when another is waiting."

  static readonly configSchema = skipperConfigSchema
  static readonly defaultConfig = defaultSkipperConfig

  /** Last PLAYBACK_STATE_CHANGED for this room; null until one arrives. */
  private playbackState: "playing" | "paused" | "stopped" | null = null

  /** Users whose persona this plugin is removing because they spent their last skip. */
  private retiredAfterLastSkip = new Set<string>()

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<PluginComponentState> {
    return this.buildStore()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("QUEUE_CHANGED", () => this.publishStore())
    this.on("TRACK_CHANGED", () => this.publishStore())
    this.on("USER_JOINED", () => this.publishStore())
    this.on("USER_LEFT", () => this.publishStore())
    this.on("ROOM_SETTINGS_UPDATED", () => this.publishStore())
    this.on("PLAYBACK_STATE_CHANGED", (data) => {
      this.playbackState = data.state
      return this.publishStore()
    })
    this.on("PERSONA_ASSIGNED", (data) => this.onPersonaChanged(data, true))
    this.on("PERSONA_REMOVED", (data) => this.onPersonaChanged(data, false))
    this.onConfigChange((data) => this.handleConfigChange(data))

    const config = await this.getConfig()
    if (config?.enabled) {
      await this.registerPersona()
    }
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    _params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    if (action !== "skip") {
      return { success: false, message: `Unknown action: ${action}` }
    }
    if (!this.context) return { success: false, message: "Plugin not ready" }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Skipper is not enabled" }
    }

    if (!initiator?.userId || !(await this.holdsPersona(initiator.userId))) {
      return { success: false, message: "Only a Skipper can skip" }
    }

    const limit = config.skipLimit ?? 0
    if (limit > 0 && (await this.skipsUsed(initiator.userId)) >= limit) {
      return { success: false, message: "You've used all of your skips" }
    }

    const check = await this.checkSkippable()
    if (!check.ok) {
      return { success: false, message: check.message }
    }

    // Claim the skip before acting so concurrent clicks can't both spend the last one.
    const used = limit > 0 ? await this.context.storage.inc(skipCountKey(initiator.userId)) : 0
    if (limit > 0 && used > limit) {
      await this.context.storage.dec(skipCountKey(initiator.userId))
      return { success: false, message: "You've used all of your skips" }
    }

    const skipperName = await this.currentUsername(initiator)
    const title = check.nowPlaying.title

    if (!check.autoAdvance) {
      const paused = await this.context.playback.pausePlayback(this.context.roomId)
      if (!paused.success) {
        if (limit > 0) await this.context.storage.dec(skipCountKey(initiator.userId))
        return paused
      }
      this.playbackState = "paused"
      await this.publishStore()
      await this.announce(`${skipperName} skipped "${title}" (paused; queue auto-advance is off)`)
      await this.afterSkip(initiator.userId, limit, used)
      return { success: true, message: "Paused" }
    }

    try {
      await this.context.queue.skipTrack(this.context.roomId, check.nowPlaying.mediaSource.trackId)
    } catch (error) {
      if (limit > 0) await this.context.storage.dec(skipCountKey(initiator.userId))
      throw error
    }
    await this.announce(`${skipperName} skipped "${title}"`)
    await this.afterSkip(initiator.userId, limit, used)
    return { success: true, message: "Skipped" }
  }

  /** Report the remaining allowance, or retire the Skipper after their last skip. */
  private async afterSkip(userId: string, limit: number, used: number): Promise<void> {
    if (limit <= 0) return
    const left = Math.max(0, limit - used)
    if (left > 0) {
      await this.context!.api.sendUserSystemMessage(
        this.context!.roomId,
        userId,
        `You have ${left} skip${left === 1 ? "" : "s"} left.`,
        { type: "alert", status: "info" },
      )
      return
    }
    // PERSONA_REMOVED clears the count, republishes the store, and sends the notice.
    this.retiredAfterLastSkip.add(userId)
    try {
      await this.personas.remove(userId, SKIPPER_PERSONA_ID)
    } catch (error) {
      this.retiredAfterLastSkip.delete(userId)
      throw error
    }
  }

  private async skipsUsed(userId: string): Promise<number> {
    const raw = await this.context!.storage.get(skipCountKey(userId))
    return raw ? Number(raw) || 0 : 0
  }

  /** The initiator's username is captured at socket join; read the stored user for renames. */
  private async currentUsername(initiator: PluginActionInitiator): Promise<string> {
    const [user] = await this.context!.api.getUsersByIds([initiator.userId]).catch(() => [])
    return user?.username || initiator.username || "A Skipper"
  }

  private async announce(message: string): Promise<void> {
    await this.context!.api.sendSystemMessage(this.context!.roomId, message, {
      type: "alert",
      status: "info",
    })
  }

  private async handleConfigChange(data: {
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    const wasEnabled = data.previousConfig?.enabled === true
    const isEnabled = data.config?.enabled === true
    if (!wasEnabled && isEnabled) {
      await this.registerPersona()
    } else if (wasEnabled && !isEnabled) {
      await this.personas.unregisterPersonas()
    }
    if (wasEnabled !== isEnabled) {
      await this.publishStore({ force: true })
    } else if (data.previousConfig?.skipLimit !== data.config?.skipLimit) {
      await this.publishStore()
    }
  }

  private async registerPersona(): Promise<void> {
    await this.personas.registerPersonas([
      {
        id: SKIPPER_PERSONA_ID,
        label: "Skipper",
        icon: "ShipWheel",
        exclusive: false,
        assignableByAdmin: true,
        decoratesUser: true,
        decoratesChatMessage: true,
      },
    ])
  }

  private async onPersonaChanged(
    data: { roomId: string; userId: string; personaId: string },
    assigned: boolean,
  ): Promise<void> {
    if (data.personaId !== SKIPPER_PERSONA_FULL_ID) return
    // Losing the persona clears the count, so a reassignment starts a fresh limit.
    await this.context!.storage.del(skipCountKey(data.userId))
    await this.publishStore()
    if (!assigned && this.retiredAfterLastSkip.delete(data.userId)) {
      await this.context!.api.sendUserSystemMessage(
        data.roomId,
        data.userId,
        "That was your last skip, so you're no longer a Skipper.",
        { type: "alert", status: "warning" },
      )
      return
    }
    const limit = (await this.getConfig())?.skipLimit ?? 0
    const allowance = limit > 0 ? ` You have ${limit} skip${limit === 1 ? "" : "s"}.` : ""
    await this.context!.api.sendUserSystemMessage(
      data.roomId,
      data.userId,
      assigned
        ? `You've been promoted to Skipper. You may now skip the current track.${allowance}`
        : "You're no longer a Skipper.",
      { type: "alert", status: assigned ? "success" : "info" },
    )
  }

  private async holdsPersona(userId: string): Promise<boolean> {
    const assignments = await this.personas.getUserPersonas(userId)
    return assignments.some((a) => a.personaId === SKIPPER_PERSONA_FULL_ID)
  }

  private async checkSkippable(): Promise<SkipCheck> {
    const context = this.context!
    const room = await context.getRoom()
    if (room?.playbackMode !== "app-controlled") {
      return { ok: false, message: "Skipping needs app-controlled playback" }
    }

    const nowPlaying = await context.queue.getNowPlaying(context.roomId)
    if (!nowPlaying) {
      return { ok: false, message: "Nothing is playing" }
    }
    if (nowPlaying.pin && nowPlaying.pin.pluginName !== this.name) {
      return { ok: false, message: "This track is held and can't be skipped" }
    }

    const queue = await context.queue.getQueue(context.roomId)
    if (queue.length === 0) {
      return { ok: false, message: "There's no track waiting in the queue" }
    }

    const autoAdvance = room.queueAutoAdvance !== false
    if (!autoAdvance && this.playbackState !== null && this.playbackState !== "playing") {
      return { ok: false, message: "The track is already paused" }
    }

    return { ok: true, nowPlaying, autoAdvance }
  }

  private async buildStore(): Promise<SkipperStore> {
    if (!this.context) return { ...EMPTY_SKIPPER_STORE }
    const config = await this.getConfig()
    if (!config?.enabled) return { ...EMPTY_SKIPPER_STORE }

    const [holders, check] = await Promise.all([
      this.personas.getUsersWithPersona(SKIPPER_PERSONA_ID),
      this.checkSkippable(),
    ])
    const limit = config.skipLimit ?? 0
    if (limit <= 0 || holders.length === 0) {
      return { skipperUserIds: holders, canSkip: check.ok }
    }
    const counts = await this.context.storage.mget(holders.map(skipCountKey))
    const skipperUserIds = holders.filter((_, i) => (Number(counts[i]) || 0) < limit)
    return { skipperUserIds, canSkip: check.ok }
  }

  private async publishStore(options?: { force?: boolean }): Promise<void> {
    if (!this.context) return
    if (!options?.force && !(await this.getConfig())?.enabled) return
    const store = await this.buildStore()
    await this.emit("SKIP_STATUS", store, { invalidatesUserState: false })
  }
}

export function createSkipperPlugin(configOverrides?: Partial<SkipperConfig>): Plugin {
  return new SkipperPlugin(configOverrides)
}

export default createSkipperPlugin
