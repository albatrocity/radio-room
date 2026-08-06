import type {
  BingoCard,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginConfigSchema,
  PluginContext,
  SystemEventPayload,
} from "@repo/types"
import {
  PLAYLIST_BINGO_PLUGIN_NAME,
  PLAYLIST_BINGO_STORAGE_KEYS,
} from "@repo/types"
import { isInclusiveMode } from "@repo/game-logic"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import { buildCriterionPool, dealBingoCard, validatePoolForCategory } from "./card"
import { matchesCriterion } from "./matching"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  bingoCategorySchema,
  defaultPlaylistBingoConfig,
  normalizeConfigCriterion,
  playlistBingoConfigSchema,
  type BingoCategory,
  type BingoRound,
  type BingoRoundCategorySnapshot,
  type PlaylistBingoComponentState,
  type PlaylistBingoConfig,
  type PlaylistBingoEvents,
  type PlaylistBingoPublicState,
} from "./types"
import { hasBingo } from "./win"

export type { PlaylistBingoConfig } from "./types"
export {
  playlistBingoConfigSchema,
  defaultPlaylistBingoConfig,
  normalizeConfigCriterion,
} from "./types"
export { matchesCriterion, parseReleaseYear, containsNormalized } from "./matching"
export { dealBingoCard, buildCriterionPool } from "./card"
export { hasBingo } from "./win"
export { labelForCriterion } from "./labels"

const KEYS = PLAYLIST_BINGO_STORAGE_KEYS
const WINNER_PERSONA_ID = "winner"
const PLUGIN_NAME = PLAYLIST_BINGO_PLUGIN_NAME

type ActionResult = { success: boolean; message?: string }

function notInitialized(): ActionResult {
  return { success: false, message: "Plugin not initialized" }
}

function interpolate(
  template: string,
  vars: { username: string; coins: number },
): string {
  return template
    .replace(/\{\{username\}\}/g, vars.username)
    .replace(/\{\{coins\}\}/g, String(vars.coins))
}

export class PlaylistBingoPlugin extends BasePlugin<PlaylistBingoConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description =
    "Playlist Bingo — private cards marked from playlist tracks (year, decade, or mixed criteria)."

  static readonly configSchema = playlistBingoConfigSchema as any
  static readonly defaultConfig = defaultPlaylistBingoConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<PlaylistBingoComponentState> {
    return this.publicState()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("PLAYLIST_TRACK_ADDED", (data) => this.onPlaylistTrackAdded(data))
    this.on("USER_JOINED", (data) => this.onUserJoined(data))
    await this.syncPersonas(await this.getConfig())
    this.onConfigChange(async () => {
      await this.syncPersonas(await this.getConfig())
    })
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    switch (action) {
      case "startRound":
        return this.startRound(initiator)
      case "endRound":
        return this.endRound(initiator)
      case "setCategory":
        return this.setCategory(initiator, params)
      default:
        return super.executeAction(action, initiator, params)
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  private async startRound(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Playlist Bingo is disabled." }
    }

    const session = await this.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session." }
    }

    const existing = await this.loadRound()
    if (existing?.active) {
      return { success: false, message: "A bingo round is already active. End it first." }
    }

    const snapshot = this.snapshotFromConfig(config)
    const pool = buildCriterionPool(config.category, snapshot)
    const validation = validatePoolForCategory(config.category, pool)
    if (!validation.ok) {
      return { success: false, message: validation.message }
    }

    await this.clearWinnerPersonas()
    await this.context.storage.del(KEYS.CARDS)
    await this.context.storage.del(KEYS.WINNERS)

    const round: BingoRound = {
      active: true,
      category: config.category,
      startedAt: Date.now(),
      categorySnapshot: snapshot,
    }
    await this.saveRound(round)

    const users = await this.context.api.getUsers(this.context.roomId)
    for (const user of users) {
      if (!user.userId || user.userId === "system") continue
      const card = dealBingoCard(user.userId, config.category, snapshot)
      await this.saveCard(card)
    }

    const publicState = await this.publicState(
      "Bingo round started — check the Bingo tab for your card.",
    )
    await this.emit<PlaylistBingoEvents["ROUND_STARTED"]>("ROUND_STARTED", publicState)

    return { success: true, message: `Bingo round started (${config.category}).` }
  }

  private async endRound(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const round = await this.loadRound()
    if (!round?.active) {
      return { success: false, message: "No active bingo round." }
    }

    const winners = await this.listWinnerUserIds()
    const users = winners.length
      ? await this.context.api.getUsersByIds(winners)
      : []
    const names = users.map((u) => u.username?.trim() || u.userId).join(", ")
    const message = winners.length
      ? `Bingo round ended. Winners: ${names}`
      : "Bingo round ended. No bingos this round."

    await this.context.api.sendSystemMessage(this.context.roomId, message)

    round.active = false
    await this.saveRound(round)

    const publicState = await this.publicState(message)
    await this.emit<PlaylistBingoEvents["ROUND_ENDED"]>("ROUND_ENDED", publicState)

    return { success: true, message: "Bingo round ended." }
  }

  private async setCategory(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const parsed = bingoCategorySchema.safeParse(params?.category)
    if (!parsed.success) {
      return { success: false, message: "Invalid category." }
    }

    const config = (await this.getConfig()) ?? defaultPlaylistBingoConfig
    const next: PlaylistBingoConfig = {
      ...config,
      category: parsed.data,
    }

    const yearStart = Number(params?.yearStart)
    const yearEnd = Number(params?.yearEnd)
    const decadeStart = Number(params?.decadeStart)
    const decadeEnd = Number(params?.decadeEnd)
    if (Number.isFinite(yearStart)) next.yearStart = Math.round(yearStart)
    if (Number.isFinite(yearEnd)) next.yearEnd = Math.round(yearEnd)
    if (Number.isFinite(decadeStart)) next.decadeStart = Math.round(decadeStart)
    if (Number.isFinite(decadeEnd)) next.decadeEnd = Math.round(decadeEnd)

    await this.context.api.setPluginConfig(this.context.roomId, this.name, next)
    return {
      success: true,
      message: `Category set to ${parsed.data}. Mixed criteria are edited in plugin settings.`,
    }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  private async onPlaylistTrackAdded(
    data: SystemEventPayload<"PLAYLIST_TRACK_ADDED">,
  ): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const round = await this.loadRound()
    if (!round?.active) return

    const track = data.track
    const all = await this.context.storage.hgetall(KEYS.CARDS)
    let anyCardChanged = false
    const bingos: { userId: string; username: string }[] = []

    for (const [userId, raw] of Object.entries(all)) {
      let card: BingoCard
      try {
        card = JSON.parse(raw) as BingoCard
      } catch {
        continue
      }
      if (card.status === "locked" || card.status === "won") continue

      let changed = false
      for (const cell of card.cells) {
        if (cell.marked || cell.free || cell.criterion.type === "free") continue
        if (matchesCriterion(track, cell.criterion)) {
          cell.marked = true
          changed = true
        }
      }
      if (!changed) continue

      anyCardChanged = true
      if (hasBingo(card.cells)) {
        const mode = config.mode
        if (isInclusiveMode(mode)) {
          card.status = "locked"
        } else {
          card.status = "won"
        }
        card.wonAt = Date.now()
        await this.saveCard(card)
        await this.context.storage.hset(KEYS.WINNERS, userId, "1")

        const [user] = await this.context.api.getUsersByIds([userId])
        const username = user?.username?.trim() || userId
        await this.awardBingo({ config, userId, username, mode })
        bingos.push({ userId, username })

        if (!isInclusiveMode(mode)) {
          // PvP: end round after first bingo
          round.active = false
          await this.saveRound(round)
          const publicState = await this.publicState(`${username} got BINGO! Round over.`)
          await this.emit<PlaylistBingoEvents["ROUND_ENDED"]>("ROUND_ENDED", publicState)
          return
        }
      } else {
        await this.saveCard(card)
      }
    }

    if (anyCardChanged || bingos.length > 0) {
      const publicState = await this.publicState()
      await this.emit<PlaylistBingoEvents["ROUND_UPDATED"]>("ROUND_UPDATED", publicState)
    }
  }

  private async onUserJoined(data: SystemEventPayload<"USER_JOINED">): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const round = await this.loadRound()
    if (!round?.active) return

    const userId = data.user?.userId
    if (!userId || userId === "system") return

    const existing = await this.context.storage.hget(KEYS.CARDS, userId)
    if (existing) return

    const card = dealBingoCard(userId, round.category, round.categorySnapshot)
    await this.saveCard(card)
    const publicState = await this.publicState()
    await this.emit<PlaylistBingoEvents["ROUND_UPDATED"]>("ROUND_UPDATED", publicState)
  }

  private async awardBingo(params: {
    config: PlaylistBingoConfig
    userId: string
    username: string
    mode: PlaylistBingoConfig["mode"]
  }): Promise<void> {
    if (!this.context) return
    const { config, userId, username, mode } = params
    const coins = config.coinReward

    if (coins > 0) {
      await this.context.game.addScore(userId, "coin", coins, this.name)
      await this.context.game.addScore(userId, "score", coins, this.name)
    }

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      interpolate(config.bingoMessageTemplate, { username, coins }),
    )

    await this.emit<PlaylistBingoEvents["BINGO"]>("BINGO", { userId, username, mode })

    if (config.soundEffectOnBingo) {
      const url = config.soundEffectOnBingoUrl ?? ""
      if (isInclusiveMode(mode)) {
        await this.context.api.queueSoundEffect({ url, volume: 0.3, userId })
      } else {
        await this.context.api.queueSoundEffect({ url, volume: 0.3 })
      }
    }

    await this.context.api.queueScreenEffect({
      target: "plugin",
      targetId: "bingo-card",
      effect: "tada",
      duration: 1200,
      ...(isInclusiveMode(mode) ? { recipientUserId: userId } : {}),
    })

    const label = config.winnerLabel?.trim()
    if (label) {
      await this.personas.assign(userId, WINNER_PERSONA_ID, this.name)
    }
  }

  // ==========================================================================
  // Personas + storage
  // ==========================================================================

  private async syncPersonas(config: PlaylistBingoConfig | null): Promise<void> {
    if (!this.context) return
    const label = config?.winnerLabel?.trim()
    if (config?.enabled && label) {
      const icon = config.winnerIcon?.trim()
      const exclusive = !isInclusiveMode(config.mode)
      await this.personas.registerPersonas([
        {
          id: WINNER_PERSONA_ID,
          label,
          ...(icon ? { icon } : {}),
          exclusive,
          decoratesUser: true,
          decoratesChatMessage: true,
        },
      ])
    } else {
      await this.clearWinnerPersonas()
      await this.personas.unregisterPersonas()
    }
  }

  private async clearWinnerPersonas(): Promise<void> {
    if (!this.context) return
    try {
      const holders = await this.personas.getUsersWithPersona(WINNER_PERSONA_ID)
      for (const userId of holders) {
        await this.personas.remove(userId, WINNER_PERSONA_ID)
      }
    } catch {
      // Persona may not be registered yet
    }
  }

  private snapshotFromConfig(config: PlaylistBingoConfig): BingoRoundCategorySnapshot {
    if (config.category === "mixed") {
      return {
        criteria: (config.criteria ?? []).map((row) => normalizeConfigCriterion(row)),
      }
    }
    if (config.category === "releaseYear") {
      return { yearStart: config.yearStart, yearEnd: config.yearEnd }
    }
    return { decadeStart: config.decadeStart, decadeEnd: config.decadeEnd }
  }

  private async loadRound(): Promise<BingoRound | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(KEYS.ROUND)
    if (!raw) return null
    try {
      return JSON.parse(raw) as BingoRound
    } catch {
      return null
    }
  }

  private async saveRound(round: BingoRound): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(KEYS.ROUND, JSON.stringify(round))
  }

  private async saveCard(card: BingoCard): Promise<void> {
    if (!this.context) return
    await this.context.storage.hset(KEYS.CARDS, card.userId, JSON.stringify(card))
  }

  private async listWinnerUserIds(): Promise<string[]> {
    if (!this.context) return []
    const all = await this.context.storage.hgetall(KEYS.WINNERS)
    return Object.keys(all)
  }

  private async publicState(statusMessage?: string): Promise<PlaylistBingoPublicState> {
    const round = await this.loadRound()
    const category: BingoCategory | null = round?.category ?? null
    return {
      roundActive: round?.active === true,
      category,
      statusMessage:
        statusMessage ??
        (round?.active ? `Bingo round active (${category ?? "—"})` : null),
    }
  }

  private async requireRoomAdmin(
    initiator?: PluginActionInitiator,
  ): Promise<{ ok: true } | { ok: false; result: ActionResult }> {
    if (!this.context) {
      return { ok: false, result: notInitialized() }
    }
    const userId = initiator?.userId?.trim()
    if (!userId) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }
    const isAdmin = await this.context.api.isRoomAdmin(this.context.roomId, userId)
    if (!isAdmin) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }
    return { ok: true }
  }
}

export function createPlaylistBingoPlugin(
  configOverrides?: Partial<PlaylistBingoConfig>,
): Plugin {
  return new PlaylistBingoPlugin(configOverrides)
}

export default createPlaylistBingoPlugin
