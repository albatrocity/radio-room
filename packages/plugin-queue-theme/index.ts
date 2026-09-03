import type {
  ContributeToUserGameStateContext,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginConfigSchema,
  PluginContext,
  Poll,
  QueueItem,
  SystemEventPayload,
} from "@repo/types"
import { canonicalQueueTrackKey, isPluginAttributedUserId } from "@repo/types"
import { BasePlugin, fetchTopZsetEntries, HOT_LEADERBOARD_TOP_N } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  computeDjPayout,
  parseNonNegInt,
  parseTruthyParam,
  sampleUserIds,
  tallyThemeVotes,
} from "./payout"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  QUEUE_THEME_PLUGIN_NAME,
  QUEUE_THEME_STORAGE_KEYS,
  defaultQueueThemeConfig,
  queueThemeConfigSchema,
  type QueueThemeComponentState,
  type QueueThemeConfig,
  type QueueThemeEvents,
  type QueueThemeRound,
  type QueueThemeUserBrief,
} from "./types"

export type { QueueThemeConfig, QueueThemeUserBrief, QueueThemeRound } from "./types"
export { queueThemeConfigSchema, defaultQueueThemeConfig, QUEUE_THEME_PLUGIN_NAME } from "./types"
export { computeDjPayout, tallyThemeVotes } from "./payout"

const KEYS = QUEUE_THEME_STORAGE_KEYS
const PLUGIN_NAME = QUEUE_THEME_PLUGIN_NAME

type ActionResult = {
  success: boolean
  message?: string
}

function notInitialized(): ActionResult {
  return { success: false, message: "Plugin not initialized" }
}

function isBriefEligibleUserId(userId: string | null | undefined): userId is string {
  return !!userId && userId !== "system" && !isPluginAttributedUserId(userId)
}

export class QueueThemePlugin extends BasePlugin<QueueThemeConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description =
    "Queue Theme — themed queue rounds with per-track yes/no polls, coin payouts, and optional decoy themes."

  static readonly configSchema = queueThemeConfigSchema as any
  static readonly defaultConfig = defaultQueueThemeConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<QueueThemeComponentState & { statusMessage: string | null }> {
    return this.publicState()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("TRACK_CHANGED", (data) => this.onTrackChanged(data))
    this.on("POLL_VOTE_CAST", (data) => this.onPollVoteCast(data))
    this.on("USER_JOINED", (data) => this.onUserJoined(data))
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    switch (action) {
      case "startRound":
        return this.startRound(initiator, params)
      case "endRound":
        return this.endRound(initiator)
      default:
        return super.executeAction(action, initiator, params)
    }
  }

  async contributeToUserGameState(
    userId: string,
    _ctx: ContributeToUserGameStateContext,
  ): Promise<Record<string, unknown> | null> {
    if (!this.context) return null
    const round = await this.loadRound()
    if (!round?.active) {
      return { theme: null, isDecoy: false }
    }
    const assignment = await this.ensureBriefFor(userId, round)
    return assignment ?? { theme: null, isDecoy: false }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  private async startRound(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Queue Theme is disabled." }
    }

    const session = await this.game.getActiveSession()
    if (!session) {
      return { success: false, message: "No active game session. Start a game session first." }
    }

    const existing = await this.loadRound()
    if (existing?.active) {
      return { success: false, message: "A Queue Theme round is already active. End it first." }
    }

    const theme = typeof params?.theme === "string" ? params.theme.trim() : ""
    if (!theme) {
      return { success: false, message: "Theme is required." }
    }

    const decoyThemeRaw =
      typeof params?.decoyTheme === "string" ? params.decoyTheme.trim() : ""
    const decoyCount = parseNonNegInt(params?.decoyCount, 0)
    const useDecoy = decoyThemeRaw.length > 0 && decoyCount > 0
    if (decoyThemeRaw && decoyCount <= 0) {
      return { success: false, message: "Set decoy count to at least 1 when providing a decoy theme." }
    }
    if (decoyCount > 0 && !decoyThemeRaw) {
      return { success: false, message: "Provide a decoy theme when decoy count is greater than 0." }
    }

    const activePoll = await this.context.api.getActivePoll(this.context.roomId)
    if (activePoll) {
      return {
        success: false,
        message: "A poll is already active. Close it before starting Queue Theme.",
      }
    }

    const users = await this.context.api.getUsers(this.context.roomId)
    const eligibleIds = users
      .map((u) => u.userId)
      .filter(isBriefEligibleUserId)

    const decoyUserIds = useDecoy ? sampleUserIds(eligibleIds, decoyCount) : []
    const decoySet = new Set(decoyUserIds)

    await this.context.storage.del(KEYS.BRIEFS)
    await this.context.storage.del(KEYS.STANDINGS)

    await Promise.all(
      eligibleIds.map(async (userId) => {
        const isDecoy = decoySet.has(userId)
        await this.saveBrief(userId, {
          theme: isDecoy ? decoyThemeRaw : theme,
          isDecoy,
        })
      }),
    )
    await Promise.all(
      eligibleIds.map((userId) => {
        const isDecoy = decoySet.has(userId)
        return this.context!.api.sendUserSystemMessage(
          this.context!.roomId,
          userId,
          isDecoy
            ? `Queue Theme decoy theme: ${decoyThemeRaw}`
            : `Queue Theme: ${theme}`,
        )
      }),
    )

    const round: QueueThemeRound = {
      active: true,
      theme,
      decoyTheme: useDecoy ? decoyThemeRaw : null,
      decoyUserIds,
      startedBy: initiator!.userId!,
      startedAt: Date.now(),
      pollId: null,
      pollTrackKey: null,
      pollDjUserId: null,
      optionIds: null,
    }
    await this.saveRound(round)

    if (parseTruthyParam(params?.reserveQueue)) {
      const queue = await this.context.api.getQueue(this.context.roomId)
      const unlocked = queue.filter((item) => !item.locked)
      if (unlocked.length >= 1) {
        const belowKey = canonicalQueueTrackKey(unlocked[0]!)
        const splitResult = await this.context.api.setQueueSplit(this.context.roomId, belowKey)
        if (!splitResult.success) {
          await this.context.api.sendSystemMessage(
            this.context.roomId,
            `Queue Theme: could not reserve queue (${splitResult.message}). Round started without a split.`,
          )
        }
      }
    }

    const startMessage = useDecoy
      ? `Queue Theme started — open Add to Queue to see your theme. ${decoyUserIds.length} listener(s) have a decoy theme.`
      : `Queue Theme started — open Add to Queue to see your theme.`
    await this.context.api.sendSystemMessage(this.context.roomId, startMessage, {
      type: "alert",
      status: "info",
    })

    const publicState = await this.publicState(startMessage)
    await this.emit<QueueThemeEvents["ROUND_STARTED"]>("ROUND_STARTED", publicState)

    // Open a poll for the current track if one is playing
    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)
    if (nowPlaying) {
      await this.serialize(async () => {
        await this.openPollForTrack(nowPlaying, initiator!.userId!)
      })
    }

    return {
      success: true,
      message: useDecoy
        ? `Round started with decoy mode (${decoyUserIds.length} decoy player(s)).`
        : "Round started.",
    }
  }

  private async endRound(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const existing = await this.loadRound()
    if (!existing?.active) {
      return { success: false, message: "No active Queue Theme round." }
    }

    const closerUserId = initiator?.userId ?? existing.startedBy

    await this.serialize(async () => {
      // Reload inside the lock so we close the poll that is actually open
      // (TRACK_CHANGED / quorum may have rotated pollId since endRound started).
      const round = (await this.loadRound()) ?? existing
      if (round.pollId) {
        await this.closeAndSettle(round, closerUserId, { openNext: null })
      }

      // Guarantee the core poll slot is clear even if round.pollId was desynced.
      const active = await this.context!.api.getActivePoll(this.context!.roomId)
      if (active) {
        await this.context!.api.closePoll({
          roomId: this.context!.roomId,
          userId: closerUserId,
          pollId: active.id,
          announce: false,
        })
      }
    })

    // Reveal decoys on end
    if (existing.decoyUserIds.length > 0) {
      const decoys = await this.context.api.getUsersByIds(existing.decoyUserIds)
      const names = decoys.map((u) => u.username?.trim() || u.userId).join(", ")
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        names
          ? `Queue Theme ended. Decoy theme holder(s): ${names}.`
          : "Queue Theme ended.",
      )
    } else {
      await this.context.api.sendSystemMessage(this.context.roomId, "Queue Theme ended.")
    }

    const ended: QueueThemeRound = {
      ...existing,
      active: false,
      pollId: null,
      pollTrackKey: null,
      pollDjUserId: null,
      optionIds: null,
    }
    await this.saveRound(ended)
    await this.context.storage.del(KEYS.BRIEFS)

    const publicState = await this.publicState("Round ended")
    await this.emit<QueueThemeEvents["ROUND_ENDED"]>("ROUND_ENDED", publicState)

    return { success: true, message: "Round ended." }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  private async onTrackChanged(
    data: SystemEventPayload<"TRACK_CHANGED">,
  ): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    await this.serialize(async () => {
      const round = await this.loadRound()
      if (!round?.active) return

      const hostUserId = round.startedBy
      await this.closeAndSettle(round, hostUserId, { openNext: data.track })
    })
  }

  private async onPollVoteCast(
    data: SystemEventPayload<"POLL_VOTE_CAST">,
  ): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    await this.serialize(async () => {
      const round = await this.loadRound()
      if (!round?.active || !round.pollId || round.pollId !== data.pollId) return

      const voterIds = await this.context!.api.getPollVoterIds(
        this.context!.roomId,
        round.pollId,
      )
      const eligible = await this.eligibleVoterIds(round.pollDjUserId)
      if (eligible.length === 0) return

      const voted = new Set(voterIds)
      const votedEligible = eligible.filter((id) => voted.has(id))
      if (votedEligible.length < eligible.length) return

      await this.closeAndSettle(round, round.startedBy, { openNext: null })
    })
  }

  private async onUserJoined(data: SystemEventPayload<"USER_JOINED">): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const userId = data.user?.userId
    const assignment = await this.ensureBriefFor(userId)
    if (!assignment) return
    await this.context.api.sendUserSystemMessage(
      this.context.roomId,
      userId,
      `Queue Theme: ${assignment.theme}`,
    )
  }

  // ==========================================================================
  // Poll cycle
  // ==========================================================================

  private async closeAndSettle(
    round: QueueThemeRound,
    closerUserId: string,
    opts: { openNext: QueueItem | null },
  ): Promise<void> {
    if (!this.context) return

    let snapshot: (QueueThemeComponentState & { statusMessage: string | null }) | null = null
    if (round.pollId) {
      const closed = await this.context.api.closePoll({
        roomId: this.context.roomId,
        userId: closerUserId,
        pollId: round.pollId,
        announce: false,
      })

      let paidOut = false
      if (closed.ok && round.optionIds) {
        paidOut = await this.applyPayout(round)
      }

      const settledRound = {
        ...round,
        pollId: null,
        pollTrackKey: null,
        pollDjUserId: null,
        optionIds: null,
      }
      await this.saveRound(settledRound)
      snapshot = await this.publicState()
      if (paidOut) {
        await this.emit<QueueThemeEvents["STANDINGS_UPDATED"]>("STANDINGS_UPDATED", snapshot, {
          invalidatesUserState: false,
        })
      }
    }

    if (opts.openNext) {
      await this.openPollForTrack(opts.openNext, closerUserId, {
        reusePublicState: snapshot ?? undefined,
      })
    } else {
      const publicState = snapshot ?? (await this.publicState())
      await this.emit<QueueThemeEvents["POLL_CYCLE"]>("POLL_CYCLE", publicState, {
        invalidatesUserState: false,
      })
    }
  }

  private async openPollForTrack(
    track: QueueItem,
    hostUserId: string,
    opts?: { reusePublicState?: QueueThemeComponentState & { statusMessage: string | null } },
  ): Promise<void> {
    if (!this.context) return
    const round = await this.loadRound()
    if (!round?.active) return

    // Do not steal a foreign poll
    const active = await this.context.api.getActivePoll(this.context.roomId)
    if (active) return

    const title = track.track?.title?.trim() || track.title?.trim() || "this track"
    const decoyMode = !!round.decoyTheme && round.decoyUserIds.length > 0
    const options = decoyMode
      ? [{ label: "Yes" }, { label: "No" }, { label: "Decoy" }]
      : [{ label: "Yes" }, { label: "No" }]

    const created = await this.context.api.createPoll({
      roomId: this.context.roomId,
      userId: hostUserId,
      question: `Does "${title}" fit the theme?`,
      options,
      settings: { hideRunningTotal: true },
      announce: false,
    })

    if (!created.ok) return

    const poll = created.poll
    const optionIds = this.mapOptionIds(poll, decoyMode)
    if (!optionIds) return

    const djUserId = track.addedBy?.userId?.trim() || null
    const pollDjUserId =
      djUserId && !isPluginAttributedUserId(djUserId) ? djUserId : null

    const next: QueueThemeRound = {
      ...round,
      pollId: poll.id,
      pollTrackKey: canonicalQueueTrackKey(track),
      pollDjUserId,
      optionIds,
    }
    await this.saveRound(next)

    const publicState = opts?.reusePublicState ?? (await this.publicState())
    await this.emit<QueueThemeEvents["POLL_CYCLE"]>("POLL_CYCLE", publicState, {
      invalidatesUserState: false,
    })
  }

  private mapOptionIds(
    poll: Poll,
    decoyMode: boolean,
  ): QueueThemeRound["optionIds"] {
    const byLabel = new Map(poll.options.map((o) => [o.label.toLowerCase(), o.id]))
    const yes = byLabel.get("yes")
    const no = byLabel.get("no")
    if (!yes || !no) return null
    if (!decoyMode) return { yes, no }
    const decoy = byLabel.get("decoy")
    if (!decoy) return null
    return { yes, no, decoy }
  }

  private async applyPayout(round: QueueThemeRound): Promise<boolean> {
    if (!this.context || !round.optionIds || !round.pollId) return false
    const config = await this.getConfig()
    if (!config) return false

    const votes = await this.context.api.getPollVotes(this.context.roomId, round.pollId)
    const tallied = tallyThemeVotes({
      votes,
      optionIds: round.optionIds,
      excludeUserId: round.pollDjUserId,
    })

    const yesCount = tallied.yesCount
    const noCount = tallied.noCount

    const payout = computeDjPayout({
      yesCount,
      noCount,
      coinPerNetVote: config.coinPerNetVote,
    })

    if (round.pollDjUserId && payout > 0) {
      await this.awardPayout(round.pollDjUserId, payout)
      const [dj] = await this.context.api.getUsersByIds([round.pollDjUserId])
      const name = dj?.username?.trim() || "DJ"
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Queue Theme: ${name} earned ${payout} coin${payout === 1 ? "" : "s"} (${yesCount} yes − ${noCount} no).`,
      )
    } else if (round.pollDjUserId) {
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Queue Theme: no payout (${yesCount} yes − ${noCount} no).`,
      )
    }

    if (
      round.optionIds.decoy &&
      round.pollDjUserId &&
      round.decoyUserIds.includes(round.pollDjUserId) &&
      config.accusationReward > 0
    ) {
      const rewarded = tallied.decoyVoterIds.filter((voterId) => voterId !== round.pollDjUserId)
      await Promise.all(rewarded.map((voterId) => this.awardPayout(voterId, config.accusationReward)))
    }
    return true
  }

  private async awardPayout(userId: string, amount: number): Promise<void> {
    if (!this.context) return
    await this.game.addScores(
      userId,
      [
        { attribute: "coin", amount },
        { attribute: "score", amount },
      ],
      this.name,
    )
    await this.context.storage.zincrby(KEYS.STANDINGS, amount, userId)
  }

  private async eligibleVoterIds(djUserId: string | null): Promise<string[]> {
    if (!this.context) return []
    const userIds = await this.context.api.getOnlineUserIds(this.context.roomId)
    return userIds.filter((id): id is string => isBriefEligibleUserId(id) && id !== djUserId)
  }

  // ==========================================================================
  // Storage / state
  // ==========================================================================

  private async ensureBriefFor(
    userId: string | null | undefined,
    round?: QueueThemeRound | null,
  ): Promise<QueueThemeUserBrief | null> {
    if (!this.context || !isBriefEligibleUserId(userId)) return null
    const resolved = round === undefined ? await this.loadRound() : round
    if (!resolved?.active) return null
    const existing = await this.loadBrief(userId)
    if (existing) return existing
    const assignment: QueueThemeUserBrief = { theme: resolved.theme, isDecoy: false }
    await this.saveBrief(userId, assignment)
    return assignment
  }

  private async loadRound(): Promise<QueueThemeRound | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(KEYS.ROUND)
    if (!raw) return null
    try {
      return JSON.parse(raw) as QueueThemeRound
    } catch {
      return null
    }
  }

  private async saveRound(round: QueueThemeRound): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(KEYS.ROUND, JSON.stringify(round))
  }

  private async loadBrief(userId: string): Promise<QueueThemeUserBrief | null> {
    if (!this.context) return null
    const raw = await this.context.storage.hget(KEYS.BRIEFS, userId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as QueueThemeUserBrief
    } catch {
      return null
    }
  }

  private async saveBrief(userId: string, brief: QueueThemeUserBrief): Promise<void> {
    if (!this.context) return
    await this.context.storage.hset(KEYS.BRIEFS, userId, JSON.stringify(brief))
  }

  private async publicState(
    statusMessage?: string | null,
  ): Promise<QueueThemeComponentState & { statusMessage: string | null }> {
    const round = await this.loadRound()
    const roundActive = !!round?.active
    const decoyMode = !!(round?.active && round.decoyTheme && round.decoyUserIds.length > 0)
    const standings = await this.buildStandings()
    return {
      roundActive,
      decoyMode,
      standings,
      statusMessage:
        statusMessage ??
        (roundActive
          ? decoyMode
            ? "Round active (decoy mode)"
            : "Round active"
          : null),
    }
  }

  private async buildStandings(): Promise<
    { score: number; value: string; username: string }[]
  > {
    if (!this.context) return []
    const entries = await fetchTopZsetEntries(
      this.context.storage,
      KEYS.STANDINGS,
      HOT_LEADERBOARD_TOP_N,
    )
    if (entries.length === 0) return []
    const users = await this.context.api.getUsersByIds(entries.map((e) => e.value))
    const byId = new Map(users.map((u) => [u.userId, u]))
    return entries.map((e) => ({
      score: e.score,
      value: e.value,
      username: byId.get(e.value)?.username?.trim() || e.value,
    }))
  }
}

export function createQueueThemePlugin(
  configOverrides?: Partial<QueueThemeConfig>,
): Plugin {
  return new QueueThemePlugin(configOverrides)
}

export default createQueueThemePlugin
