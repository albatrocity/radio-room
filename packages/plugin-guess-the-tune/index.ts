import type {
  Plugin,
  PluginActionInitiator,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  SystemEventPayload,
  ChatMessage,
  PluginAugmentationData,
  PluginElementKey,
  PluginElementProps,
  PluginObscureBypassRole,
  PluginTextElementKey,
  QueueItem,
  RoomExportData,
  PluginExportAugmentation,
} from "@repo/types"
import { queueItemStableKey } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import { interpolateTemplate } from "@repo/utils"
import packageJson from "./package.json"
import {
  guessTheTuneConfigSchema,
  defaultGuessTheTuneConfig,
  type GuessTheTuneConfig,
  type GuessProperty,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import { messageMatchesTarget } from "./matching"

export type { GuessTheTuneConfig } from "./types"
export { guessTheTuneConfigSchema, defaultGuessTheTuneConfig } from "./types"

const USER_SCORES_KEY = "user-scores"

function roundKey(stable: string): string {
  return `round:${stable}`
}

const TEXT_KEYS = ["title", "artist", "album"] as const satisfies readonly PluginTextElementKey[]

export interface GuessTheTuneComponentState extends Record<string, unknown> {
  usersLeaderboard: { score: number; value: string; username: string }[]
}

export interface GuessTheTuneEvents {
  PROPERTY_REVEALED: {
    property: GuessProperty
    userId: string
    username?: string
    points: number
    multiplier: number
    usersLeaderboard: { score: number; value: string; username: string }[]
  }
  LEADERBOARD_RESET: {
    usersLeaderboard: { score: number; value: string; username: string }[]
  }
}

function trackStrings(track: QueueItem["track"] | null | undefined): Record<GuessProperty, string> {
  if (!track) return { title: "", artist: "", album: "" }
  const title = track.title ?? ""
  const artist = track.artists?.map((a) => a.title).join(", ") ?? ""
  const album = track.album?.title ?? ""
  return { title, artist, album }
}

function propertyLabel(p: GuessProperty): string {
  switch (p) {
    case "title":
      return "track title"
    case "artist":
      return "artist name"
    case "album":
      return "album title"
  }
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** Which guess fields apply for the current config and track strings (used by chat matching and admin reveal). */
export function propsInPlay(
  config: GuessTheTuneConfig,
  targets: Record<GuessProperty, string>,
): GuessProperty[] {
  const props: GuessProperty[] = []
  if (config.matchTitle && targets.title.trim()) props.push("title")
  if (config.matchArtist && targets.artist.trim()) props.push("artist")
  if (config.matchAlbum && targets.album.trim()) props.push("album")
  return props
}

type RevealByPayload = NonNullable<PluginElementProps["revealedBy"]>

export class GuessTheTunePlugin extends BasePlugin<GuessTheTuneConfig> {
  name = "guess-the-tune"
  version = packageJson.version
  description =
    "Game mode: obscure now playing metadata, fuzzy-match chat guesses, and score a leaderboard."

  /** Cast avoids duplicate zod installs resolving to different `z` module instances under npm workspaces. */
  static readonly configSchema = guessTheTuneConfigSchema as any
  static readonly defaultConfig = defaultGuessTheTuneConfig

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  async getComponentState(): Promise<GuessTheTuneComponentState> {
    if (!this.context) return { usersLeaderboard: [] }

    const raw = await this.context.storage.zrangeWithScores(USER_SCORES_KEY, 0, -1)
    const sorted = [...raw].sort((a, b) => b.score - a.score)
    const userIds = sorted.map((e) => e.value)
    const users = await this.context.api.getUsersByIds(userIds)
    const userMap = new Map(users.map((u) => [u.userId, u.username]))

    const usersLeaderboard = sorted.map((entry) => ({
      ...entry,
      username: userMap.get(entry.value) ?? entry.value,
    }))

    return { usersLeaderboard }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("MESSAGE_RECEIVED", this.onMessageReceived.bind(this))
  }

  private async onTrackChanged(data: SystemEventPayload<"TRACK_CHANGED">): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled || !this.context) return

    const stable = queueItemStableKey(data.track)
    const rk = roundKey(stable)
    await this.context.storage.del(rk)
    await this.context.storage.hset(rk, "startedAt", String(Date.now()))

    const np = await this.context.api.getNowPlaying(this.context.roomId)
    if (np) {
      await this.context.api.updatePlaylistTrack(this.context.roomId, np)
    }
  }

  private async onMessageReceived(data: SystemEventPayload<"MESSAGE_RECEIVED">): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled || !this.context) return

    const { message } = data
    if (this.isSystemMessage(message)) return

    const np = await this.context.api.getNowPlaying(this.context.roomId)
    if (!np?.track) return

    if (
      config.ignoreOwnQueueSubmissions &&
      np.addedBy?.userId === message.user.userId
    ) {
      return
    }

    const stable = queueItemStableKey(np)
    const rk = roundKey(stable)
    const startedAtStr = await this.context.storage.hget(rk, "startedAt")
    if (!startedAtStr) return

    const startedAt = Number(startedAtStr)
    const targets = trackStrings(np.track)
    const revealedAll: Record<string, string> = { ...(await this.context.storage.hgetall(rk)) }

    const propsToTry = propsInPlay(config, targets)

    const basePoints: Record<GuessProperty, number> = {
      title: config.pointsTitle,
      artist: config.pointsArtist,
      album: config.pointsAlbum,
    }

    let needsMetaRefresh = false

    for (const prop of propsToTry) {
      const field = `revealed:${prop}`
      if (revealedAll[field]) continue

      const target = targets[prop]
      if (!messageMatchesTarget(message.content, target, config.fuzzyThreshold)) continue

      const revealedBy: RevealByPayload = {
        userId: message.user.userId,
        username: message.user.username ?? "",
        at: Date.now(),
      }

      const didSet = await this.revealRoundProperty(rk, prop, revealedBy)
      if (!didSet) continue
      revealedAll[field] = JSON.stringify(revealedBy)

      const elapsed = Date.now() - startedAt
      const mult = elapsed <= config.speedMultiplierWindowSec * 1000 ? config.speedMultiplier : 1
      const points = Math.floor(basePoints[prop] * mult)

      await this.context.storage.zincrby(USER_SCORES_KEY, points, message.user.userId)

      const multiplierSuffix = mult > 1 ? ` (${mult}× speed bonus)` : ""

      const body = interpolateTemplate(config.messageTemplate ?? "", {
        username: message.user.username ?? message.user.userId,
        propertyLabel: propertyLabel(prop),
        points: String(points),
        multiplierSuffix,
      })

      await this.context.api.sendSystemMessage(this.context.roomId, body)

      const state = await this.getComponentState()

      await this.emit<GuessTheTuneEvents["PROPERTY_REVEALED"]>("PROPERTY_REVEALED", {
        property: prop,
        userId: message.user.userId,
        username: message.user.username ?? undefined,
        points,
        multiplier: mult,
        usersLeaderboard: state.usersLeaderboard,
      })

      if (config.soundEffectOnMatch) {
        await this.context.api.queueSoundEffect({
          url: config.soundEffectOnMatchUrl ?? "",
          volume: 0.3,
        })
      }

      needsMetaRefresh = true
    }

    if (needsMetaRefresh) {
      const fresh = await this.context.api.getNowPlaying(this.context.roomId)
      if (fresh) {
        await this.context.api.updatePlaylistTrack(this.context.roomId, fresh)
      }
    }
  }

  async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
    const config = await this.getConfig()
    return this.buildElementPropsAugmentation(item, config, { requireRound: false })
  }

  async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    const config = await this.getConfig()
    return Promise.all(
      items.map((item) => this.buildElementPropsAugmentation(item, config, { requireRound: true })),
    )
  }

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    const state = await this.getComponentState()
    const allUsers = [...(exportData.userHistory || []), ...exportData.users]
    const userMap = new Map(allUsers.map((u) => [u.userId, u.username]))

    const hydrated = state.usersLeaderboard.map((item, index) => ({
      rank: index + 1,
      userId: item.value,
      username: userMap.get(item.value) ?? item.value,
      score: item.score,
    }))

    return {
      data: { usersLeaderboard: hydrated },
      markdownSections: [
        `## Guess the Tune Leaderboard\n\n${hydrated.map((r) => `${r.rank}. ${r.username}: ${r.score} points`).join("\n")}\n`,
      ],
    }
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (action === "resetLeaderboard") {
      return this.resetLeaderboard()
    }
    if (action === "revealTitle") {
      return this.adminRevealProperty("title", initiator)
    }
    if (action === "revealArtist") {
      return this.adminRevealProperty("artist", initiator)
    }
    if (action === "revealAlbum") {
      return this.adminRevealProperty("album", initiator)
    }
    if (action === "revealAll") {
      return this.adminRevealAll(initiator)
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  /**
   * Atomically set `revealed:{prop}` when not already set. Returns whether this call stored a new value.
   */
  private async revealRoundProperty(
    rk: string,
    prop: GuessProperty,
    revealedBy: RevealByPayload,
  ): Promise<boolean> {
    if (!this.context) return false
    const field = `revealed:${prop}`
    return this.context.storage.hsetnx(rk, field, JSON.stringify(revealedBy))
  }

  private resolveAdminRevealLabel(initiator?: PluginActionInitiator): string {
    const username = initiator?.username?.trim()
    if (username) return username
    const userId = initiator?.userId?.trim()
    if (userId && userId !== "system") return userId
    return "A room admin"
  }

  private buildAdminRevealedBy(initiator?: PluginActionInitiator): RevealByPayload {
    const userId = initiator?.userId?.trim() || "system"
    const label = this.resolveAdminRevealLabel(initiator)
    const username = initiator?.username?.trim() || label
    return {
      userId,
      username,
      at: Date.now(),
      source: "admin",
    }
  }

  private async adminRevealProperty(
    prop: GuessProperty,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Guess the Tune is disabled." }
    }

    const np = await this.context.api.getNowPlaying(this.context.roomId)
    if (!np?.track) {
      return { success: false, message: "Nothing is playing." }
    }

    const stable = queueItemStableKey(np)
    const rk = roundKey(stable)
    const startedAtStr = await this.context.storage.hget(rk, "startedAt")
    if (!startedAtStr) {
      return { success: false, message: "No active round for the current track." }
    }

    const targets = trackStrings(np.track)
    const inPlay = propsInPlay(config, targets)
    if (!inPlay.includes(prop)) {
      return {
        success: false,
        message: `The ${propertyLabel(prop)} is not obscured for this track.`,
      }
    }

    const field = `revealed:${prop}`
    if (await this.context.storage.hget(rk, field)) {
      return { success: true, message: `${capitalize(propertyLabel(prop))} is already revealed.` }
    }

    const label = this.resolveAdminRevealLabel(initiator)
    const revealedBy = this.buildAdminRevealedBy(initiator)
    const didSet = await this.revealRoundProperty(rk, prop, revealedBy)
    if (!didSet) {
      return { success: true, message: `${capitalize(propertyLabel(prop))} is already revealed.` }
    }

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `${label} revealed the ${propertyLabel(prop)} for everyone.`,
    )

    const fresh = await this.context.api.getNowPlaying(this.context.roomId)
    if (fresh) {
      await this.context.api.updatePlaylistTrack(this.context.roomId, fresh)
    }

    return { success: true, message: `${capitalize(propertyLabel(prop))} revealed for everyone.` }
  }

  private async adminRevealAll(
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Guess the Tune is disabled." }
    }

    const np = await this.context.api.getNowPlaying(this.context.roomId)
    if (!np?.track) {
      return { success: false, message: "Nothing is playing." }
    }

    const stable = queueItemStableKey(np)
    const rk = roundKey(stable)
    const startedAtStr = await this.context.storage.hget(rk, "startedAt")
    if (!startedAtStr) {
      return { success: false, message: "No active round for the current track." }
    }

    const targets = trackStrings(np.track)
    const order: GuessProperty[] = ["title", "artist", "album"]
    const inPlay = new Set(propsInPlay(config, targets))
    const toReveal = order.filter((p) => inPlay.has(p))

    if (toReveal.length === 0) {
      return {
        success: false,
        message: "No metadata is configured to be obscured for this track.",
      }
    }

    const label = this.resolveAdminRevealLabel(initiator)
    let anyNew = false

    for (const prop of toReveal) {
      const field = `revealed:${prop}`
      if (await this.context.storage.hget(rk, field)) continue

      const revealedBy = this.buildAdminRevealedBy(initiator)
      const didSet = await this.revealRoundProperty(rk, prop, {
        ...revealedBy,
        at: Date.now(),
      })
      if (!didSet) continue

      anyNew = true
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `${label} revealed the ${propertyLabel(prop)} for everyone.`,
      )
    }

    if (!anyNew) {
      return { success: true, message: "All obscured fields were already revealed." }
    }

    const fresh = await this.context.api.getNowPlaying(this.context.roomId)
    if (fresh) {
      await this.context.api.updatePlaylistTrack(this.context.roomId, fresh)
    }

    return { success: true, message: "Revealed all obscured fields for everyone." }
  }

  private async resetLeaderboard(): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }

    try {
      const entries = await this.context.storage.zrangeWithScores(USER_SCORES_KEY, 0, -1)
      for (const e of entries) {
        await this.context.storage.zrem(USER_SCORES_KEY, e.value)
      }

      await this.emit<GuessTheTuneEvents["LEADERBOARD_RESET"]>("LEADERBOARD_RESET", {
        usersLeaderboard: [],
      })

      return { success: true, message: "Leaderboard reset" }
    } catch (e) {
      console.error(`[${this.name}] resetLeaderboard`, e)
      return { success: false, message: String(e) }
    }
  }

  private isSystemMessage(message: ChatMessage): boolean {
    return message.user.userId === "system"
  }

  private async buildElementPropsAugmentation(
    item: QueueItem,
    config: GuessTheTuneConfig | null,
    options: { requireRound: boolean } = { requireRound: true },
  ): Promise<PluginAugmentationData> {
    if (!this.context) return {}
    if (!config?.enabled) return {}

    if (!config.matchTitle && !config.matchArtist && !config.matchAlbum) {
      return {}
    }

    const stable = queueItemStableKey(item)
    const rk = roundKey(stable)
    const startedAt = await this.context.storage.hget(rk, "startedAt")
    if (!startedAt && options.requireRound) {
      // No round exists for this track, so it should render normally.
      return {}
    }
    const revealed = await this.context.storage.hgetall(rk)

    const bypassRoles: PluginObscureBypassRole[] = config.showNowPlayingToAdmins ? ["admin"] : []

    const elementProps: Partial<Record<PluginElementKey, PluginElementProps>> = {}

    for (const key of TEXT_KEYS) {
      const matchKey = `match${capitalize(key)}` as keyof GuessTheTuneConfig
      if (!config[matchKey]) continue

      const rev = revealed[`revealed:${key}`]
      if (rev) {
        try {
          const revealedBy = JSON.parse(rev) as PluginElementProps["revealedBy"]
          if (revealedBy?.userId != null) {
            elementProps[key] = { obscured: false, revealedBy }
          } else {
            elementProps[key] = { obscured: false }
          }
        } catch {
          elementProps[key] = { obscured: false }
        }
      } else {
        elementProps[key] = {
          obscured: true,
          placeholder: "???",
          obscureBypassRoles: bypassRoles,
        }
      }
    }

    // Artwork often shows artist/album text — keep placeholder until both are revealed (when enabled).
    const artistRevealed = Boolean(revealed["revealed:artist"])
    const albumRevealed = Boolean(revealed["revealed:album"])
    const artworkObscured =
      (config.matchArtist && !artistRevealed) || (config.matchAlbum && !albumRevealed)

    elementProps.artwork = {
      obscured: artworkObscured,
      obscureBypassRoles: bypassRoles,
    }

    return { elementProps }
  }
}

export function createGuessTheTunePlugin(configOverrides?: Partial<GuessTheTuneConfig>): Plugin {
  return new GuessTheTunePlugin(configOverrides)
}

export default createGuessTheTunePlugin
