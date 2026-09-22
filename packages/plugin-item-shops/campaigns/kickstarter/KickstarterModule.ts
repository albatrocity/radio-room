import type { PluginContext, GameSessionPluginAPI } from "@repo/types"
import type { TimerConfig } from "@repo/plugin-base"
import {
  applyFrozenAssets,
  finishCampaign,
  loadCampaign,
  markPollAttempt,
  markPollOpen,
  pledge,
  settleFundingFailure,
  settleFundingSuccess,
  startCampaign,
  tallyDeliveryVotes,
  toPublicState,
  DELIVERY_DELAY_MS,
  FUNDING_DURATION_MS,
  POLL_BUSY_RETRY_INTERVAL_MS,
  POLL_BUSY_RETRY_WINDOW_MS,
  POLL_DURATION_MS,
  TIMER_DELIVERY_DELAY,
  TIMER_FUNDING,
  TIMER_POLL_RETRY,
  type KickstarterCampaign,
  type KickstarterPublicState,
} from "./index"

type TimerApi = {
  startTimer: (id: string, config: TimerConfig) => void
  clearTimer: (id: string) => boolean
}

type EmitPublic = (state: KickstarterPublicState) => Promise<void>

/**
 * Owns Kickstarter timers, poll orchestration, and session-end cleanup (ADR 0188).
 * Delivery poll close uses core `closesAt` + `POLL_CLOSED` (ADR 0189).
 */
export class KickstarterModule {
  private context: PluginContext | null = null
  private game: GameSessionPluginAPI | null = null
  private timers: TimerApi | null = null
  private emitPublic: EmitPublic | null = null
  /** Prevents double-resolve when POLL_CLOSED and reconcile both fire. */
  private resolvingPollId: string | null = null

  bind(params: {
    context: PluginContext
    game: GameSessionPluginAPI
    timers: TimerApi
    emitPublic: EmitPublic
  }): void {
    this.context = params.context
    this.game = params.game
    this.timers = params.timers
    this.emitPublic = params.emitPublic
  }

  private deps() {
    if (!this.context || !this.game) throw new Error("KickstarterModule not bound")
    return { context: this.context, game: this.game }
  }

  async publicState(): Promise<KickstarterPublicState> {
    if (!this.context) return toPublicState(null)
    return toPublicState(await loadCampaign(this.context))
  }

  async startCampaign(params: {
    ownerUserId: string
    ownerName: string
    title: string
    rewards: string
    goal: number
  }) {
    const result = await startCampaign(this.deps(), params)
    if (!result.ok) return result
    this.armFundingTimer(result.campaign)
    await this.emitPublic?.(result.publicState)
    return result
  }

  async backCampaign(params: { userId: string; username: string; amount: number }) {
    const result = await pledge(this.deps(), params)
    if (!result.ok) return result
    await this.emitPublic?.(result.publicState)
    if (result.goalMet) {
      await this.onFundingSuccess(result.campaign)
    }
    return result
  }

  /** Re-arm or settle after process restart. */
  async reconcileOnRegister(): Promise<void> {
    if (!this.context) return
    const campaign = await loadCampaign(this.context)
    if (!campaign) return
    const now = Date.now()
    if (campaign.phase === "funding") {
      if (now >= campaign.phaseEndsAt) {
        await this.onFundingTimeout(campaign)
      } else {
        this.armFundingTimer(campaign, campaign.phaseEndsAt - now)
      }
      return
    }
    if (campaign.phase === "deliveryWait") {
      if (now >= campaign.phaseEndsAt) {
        await this.tryOpenDeliveryPoll(campaign)
      } else {
        this.armDeliveryDelayTimer(campaign, campaign.phaseEndsAt - now)
      }
      return
    }
    if (campaign.phase === "poll") {
      if (!campaign.pollId) {
        await this.tryOpenDeliveryPoll(campaign)
        return
      }
      const active = await this.context.api.getActivePoll(this.context.roomId)
      if (!active || active.id !== campaign.pollId) {
        // Core already closed (or never open) — settle from votes.
        await this.resolveDeliveryPoll(campaign)
        return
      }
      // Still open — wait for POLL_CLOSED (closesAt handled by core).
    }
  }

  async onGameSessionEnded(): Promise<void> {
    this.clearAllKickstarterTimers()
    if (!this.context) return
    const campaign = await loadCampaign(this.context)
    if (!campaign) return
    if (campaign.phase === "funding" && campaign.pledges.length > 0) {
      const { blocked } = await settleFundingFailure(this.deps(), campaign)
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        blocked.length > 0
          ? `The Kickstarter for “${campaign.title}” ended with the game session. Some refunds could not be completed (frozen assets).`
          : `The Kickstarter for “${campaign.title}” ended with the game session. Pledges were returned.`,
        { type: "alert", status: "warning" },
      )
    } else {
      await finishCampaign(this.deps())
    }
    await this.emitPublic?.(toPublicState(null))
  }

  /** Core poll closed (manual or expired). Settle delivery accountability. */
  async onPollClosed(pollId: string): Promise<void> {
    if (!this.context) return
    const campaign = await loadCampaign(this.context)
    if (!campaign || campaign.phase !== "poll" || campaign.pollId !== pollId) return
    await this.resolveDeliveryPoll(campaign)
  }

  private armFundingTimer(campaign: KickstarterCampaign, duration = FUNDING_DURATION_MS): void {
    this.timers?.clearTimer(TIMER_FUNDING)
    this.timers?.startTimer(TIMER_FUNDING, {
      duration: Math.max(1, duration),
      callback: async () => {
        const current = await loadCampaign(this.deps().context)
        if (!current || current.id !== campaign.id || current.phase !== "funding") return
        await this.onFundingTimeout(current)
      },
    })
  }

  private armDeliveryDelayTimer(
    campaign: KickstarterCampaign,
    duration = DELIVERY_DELAY_MS,
  ): void {
    this.timers?.clearTimer(TIMER_DELIVERY_DELAY)
    this.timers?.startTimer(TIMER_DELIVERY_DELAY, {
      duration: Math.max(1, duration),
      callback: async () => {
        const current = await loadCampaign(this.deps().context)
        if (!current || current.id !== campaign.id || current.phase !== "deliveryWait") return
        await this.tryOpenDeliveryPoll(current)
      },
    })
  }

  private clearAllKickstarterTimers(): void {
    this.timers?.clearTimer(TIMER_FUNDING)
    this.timers?.clearTimer(TIMER_DELIVERY_DELAY)
    this.timers?.clearTimer(TIMER_POLL_RETRY)
  }

  private async onFundingTimeout(campaign: KickstarterCampaign): Promise<void> {
    this.timers?.clearTimer(TIMER_FUNDING)
    if (campaign.pledged >= campaign.goal) {
      await this.onFundingSuccess(campaign)
      return
    }
    const deps = this.deps()
    const { blocked } = await settleFundingFailure(deps, campaign)
    await deps.context.api.sendSystemMessage(
      deps.context.roomId,
      blocked.length > 0
        ? `The Kickstarter for “${campaign.title}” failed to meet its goal. Some refunds could not be completed (frozen assets).`
        : `The Kickstarter for “${campaign.title}” failed to meet its goal. All pledges have been returned.`,
      { type: "alert", status: "warning" },
    )
    await deps.context.api.sendUserSystemMessage(
      deps.context.roomId,
      campaign.ownerUserId,
      `Your Kickstarter “${campaign.title}” failed — ${campaign.pledged}/${campaign.goal} coin raised. All pledges were returned.`,
      { type: "alert", status: "error" },
    )
    await this.emitPublic?.(toPublicState(null))
  }

  private async onFundingSuccess(campaign: KickstarterCampaign): Promise<void> {
    this.timers?.clearTimer(TIMER_FUNDING)
    const { campaign: next, publicState } = await settleFundingSuccess(this.deps(), campaign)
    const deps = this.deps()
    await deps.context.api.sendSystemMessage(
      deps.context.roomId,
      `“${next.title}” funded! ${next.ownerName} received ${next.pledged} coin. Rewards due soon…`,
      { type: "alert", status: "success" },
    )
    const deliveryMinutes = Math.round(DELIVERY_DELAY_MS / 60_000)
    await deps.context.api.sendUserSystemMessage(
      deps.context.roomId,
      next.ownerUserId,
      `You have ${deliveryMinutes} minute${deliveryMinutes === 1 ? "" : "s"} to deliver on your backer rewards for “${next.title}”, or face Frozen Assets.`,
      { type: "alert", status: "warning" },
    )
    await this.emitPublic?.(publicState)
    this.armDeliveryDelayTimer(next)
  }

  private async tryOpenDeliveryPoll(campaign: KickstarterCampaign): Promise<void> {
    this.timers?.clearTimer(TIMER_DELIVERY_DELAY)
    this.timers?.clearTimer(TIMER_POLL_RETRY)
    const deps = this.deps()
    const withAttempt = await markPollAttempt(deps, campaign)

    const closesAt = Date.now() + POLL_DURATION_MS
    const created = await deps.context.api.createPoll({
      roomId: deps.context.roomId,
      userId: withAttempt.ownerUserId,
      question: `Did ${withAttempt.ownerName} deliver the backer rewards for “${withAttempt.title}”?`,
      options: [{ label: "Yes" }, { label: "No" }],
      settings: { hideRunningTotal: true },
      closesAt,
      announce: true,
    })

    if (!created.ok) {
      const started = withAttempt.pollAttemptStartedAt ?? Date.now()
      if (Date.now() - started < POLL_BUSY_RETRY_WINDOW_MS) {
        this.timers?.startTimer(TIMER_POLL_RETRY, {
          duration: POLL_BUSY_RETRY_INTERVAL_MS,
          callback: async () => {
            const current = await loadCampaign(deps.context)
            if (!current || current.id !== withAttempt.id) return
            await this.tryOpenDeliveryPoll(current)
          },
        })
        return
      }
      // Busy too long — skip accountability poll (success path).
      await finishCampaign(deps)
      await this.emitPublic?.(toPublicState(null))
      return
    }

    const poll = created.poll
    const yes = poll.options[0]
    const no = poll.options[1]
    if (!yes || !no) {
      await finishCampaign(deps)
      await this.emitPublic?.(toPublicState(null))
      return
    }

    const { campaign: next, publicState } = await markPollOpen(deps, withAttempt, {
      pollId: poll.id,
      yesOptionId: yes.id,
      noOptionId: no.id,
      closesAt: poll.closesAt ?? closesAt,
    })
    await this.emitPublic?.(publicState)
  }

  private async resolveDeliveryPoll(campaign: KickstarterCampaign): Promise<void> {
    if (!campaign.pollId || !campaign.pollYesOptionId || !campaign.pollNoOptionId) {
      await finishCampaign(this.deps())
      await this.emitPublic?.(toPublicState(null))
      return
    }

    if (this.resolvingPollId === campaign.pollId) return
    this.resolvingPollId = campaign.pollId

    try {
      const deps = this.deps()
      const votes = await deps.context.api.getPollVotes(deps.context.roomId, campaign.pollId)
      const tally = tallyDeliveryVotes({
        votes,
        yesOptionId: campaign.pollYesOptionId,
        noOptionId: campaign.pollNoOptionId,
      })

      const active = await deps.context.api.getActivePoll(deps.context.roomId)
      if (active?.id === campaign.pollId) {
        await deps.context.api.closePoll({
          roomId: deps.context.roomId,
          userId: campaign.ownerUserId,
          pollId: campaign.pollId,
          announce: true,
        })
      }

      if (!tally.success) {
        await applyFrozenAssets(deps, campaign.ownerUserId)
        await deps.context.api.sendSystemMessage(
          deps.context.roomId,
          `Backers judged that “${campaign.title}” rewards were not delivered. ${campaign.ownerName}'s assets are frozen for 15 minutes.`,
          { type: "alert", status: "warning" },
        )
      }

      await finishCampaign(deps)
      await this.emitPublic?.(toPublicState(null))
    } finally {
      this.resolvingPollId = null
    }
  }
}
