import type { PluginContext, QueueFollowUp, QueueFollowUpResult, QueueItem } from "@repo/types"
import { isPluginAttributedUserId } from "@repo/types"
import { getEligibleUserIds, isEligible, recordSuccessfulQueue } from "./state"
import type { HeldQueueTrack, RoundRobinDjConfig, RoundRobinState } from "./types"

const RECENT_ENQUEUE_MS = 5000

/** Newest user enqueue in the last 5 seconds, ignoring plugin-attributed rows. */
export function recentLiveEnqueue(queue: QueueItem[]): QueueItem | null {
  let mostRecent: QueueItem | undefined
  for (const item of queue) {
    if (!item.addedAt || !item.addedBy?.userId) continue
    if (!mostRecent || item.addedAt > (mostRecent.addedAt ?? 0)) mostRecent = item
  }
  if (!mostRecent?.addedBy?.userId || !mostRecent.addedAt) return null
  if (Date.now() - mostRecent.addedAt >= RECENT_ENQUEUE_MS) return null
  if (isPluginAttributedUserId(mostRecent.addedBy.userId)) return null
  return mostRecent
}

/**
 * State as it will be once the newest live enqueue is recorded.
 * `liveUserId` is set only when that enqueue is still unrecorded and eligible.
 */
export function projectTurnAfterLiveEnqueue(
  state: RoundRobinState,
  queue: QueueItem[],
  autoAdvanceRounds: boolean,
): { state: RoundRobinState; liveUserId: string | null } {
  const recent = recentLiveEnqueue(queue)
  const userId = recent?.addedBy?.userId
  if (!userId) return { state, liveUserId: null }
  if (!state.participants.includes(userId)) return { state, liveUserId: null }
  if (state.queuedThisRound.includes(userId)) return { state, liveUserId: null }
  if (!isEligible(state, userId)) return { state, liveUserId: null }
  return {
    state: recordSuccessfulQueue(state, userId, autoAdvanceRounds).state,
    liveUserId: userId,
  }
}

const HOLD_KEY_PREFIX = "hold"

export type HoldStoreDeps = {
  getContext: () => PluginContext | null
  /** Record a successful queue add (turn advance + round messages). */
  applySuccessfulQueue: (userId: string, config: RoundRobinDjConfig) => Promise<void>
}

/**
 * Pending out-of-turn / next-round track holds and flush-on-turn.
 */
type PendingFollowUp = {
  liveUserId: string | null
  userId: string
  trackId: string
}

export class HoldStore {
  /** Prevents nested QUEUE_CHANGED from double-recording a flush we apply ourselves. */
  private recordingFlushFor = new Set<string>()
  /** Follow-up proposed by the last `proposeFollowUp`, until its result is delivered. */
  private pending: PendingFollowUp | null = null
  private deferredFlush: { state: RoundRobinState; config: RoundRobinDjConfig } | null = null
  private deferredTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: HoldStoreDeps) {}

  isRecordingFlushFor(userId: string): boolean {
    return this.recordingFlushFor.has(userId)
  }

  private holdKey(userId: string): string {
    return `${HOLD_KEY_PREFIX}:${userId}`
  }

  async loadHold(userId: string): Promise<HeldQueueTrack | null> {
    const context = this.deps.getContext()
    if (!context) return null
    const raw = await context.storage.get(this.holdKey(userId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as HeldQueueTrack
    } catch {
      return null
    }
  }

  async saveHold(userId: string, hold: HeldQueueTrack): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    await context.storage.set(this.holdKey(userId), JSON.stringify(hold))
  }

  async clearHold(userId: string): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    await context.storage.del(this.holdKey(userId))
  }

  async clearHoldsForUsers(userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => this.clearHold(userId)))
  }

  /**
   * The next held track to commit before `QUEUE_CHANGED`, if the turn that is about
   * to be recorded (or the current turn, once that record has landed) has one.
   */
  async proposeFollowUp(
    state: RoundRobinState,
    config: RoundRobinDjConfig,
    queue: QueueItem[],
  ): Promise<QueueFollowUp | null> {
    if (!config.enabled) return null
    const projected = projectTurnAfterLiveEnqueue(state, queue, config.autoAdvanceRounds)
    const target = await this.holdForSoleTurn(projected.state)
    if (!target || target.userId === projected.liveUserId) {
      this.pending = null
      return null
    }
    if (queue.some((item) => item.track.id === target.hold.trackId)) {
      this.pending = null
      return null
    }
    this.pending = {
      liveUserId: projected.liveUserId,
      userId: target.userId,
      trackId: target.hold.trackId,
    }
    return {
      type: "enqueue",
      trackId: target.hold.trackId,
      mediaSourceType: target.hold.mediaSourceType,
      addedBy: { type: "user", userId: target.userId, username: target.hold.username },
      runPluginValidation: false,
    }
  }

  /**
   * Record the live enqueue (when this follow-up was caused by one), then the flushed
   * turn on success. A failed enqueue keeps the hold and still records the live deputy.
   */
  async completeFollowUp(result: QueueFollowUpResult, config: RoundRobinDjConfig): Promise<void> {
    const pending = this.pending
    const addedBy = result.followUp.addedBy
    if (
      !pending ||
      result.followUp.trackId !== pending.trackId ||
      addedBy.type !== "user" ||
      addedBy.userId !== pending.userId
    ) {
      return
    }
    this.pending = null
    const context = this.deps.getContext()
    if (!context) return

    if (pending.liveUserId) {
      await this.clearHold(pending.liveUserId)
      await this.deps.applySuccessfulQueue(pending.liveUserId, config)
    }

    if (!result.success) {
      await context.api.sendUserSystemMessage(
        context.roomId,
        pending.userId,
        heldEnqueueFailure(result.message),
        { type: "alert", status: "error" },
      )
      return
    }

    await this.clearHold(pending.userId)
    await this.deps.applySuccessfulQueue(pending.userId, config)
  }

  /**
   * If the current turn holder has a pending track, enqueue it and advance their turn.
   * Used when the turn changes outside a queue write (leave, roster, advance, undo).
   * A queue-write flush is a follow-up instead, so this is not called from `QUEUE_CHANGED`.
   */
  async flushHoldForCurrentTurn(state: RoundRobinState, config: RoundRobinDjConfig): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    const target = await this.holdForSoleTurn(state)
    if (!target) return

    if (context.appContext.systemEvents?.isEmittingToPlugins?.(context.roomId)) {
      this.scheduleFlush(state, config)
      return
    }

    const { userId, hold } = target
    this.recordingFlushFor.add(userId)
    try {
      const result = await context.queue.addToTrackQueue(context.roomId, hold.trackId, {
        addedBy: { type: "user", userId, username: hold.username },
        // Do not re-run validators: the hold was already accepted, and another plugin
        // can reject immediately after the previous deputy queued.
        runPluginValidation: false,
        mediaSourceType: hold.mediaSourceType,
      })

      if (!result.success) {
        await context.api.sendUserSystemMessage(
          context.roomId,
          userId,
          heldEnqueueFailure(result.message),
          { type: "alert", status: "error" },
        )
        return
      }

      await this.clearHold(userId)
      await this.deps.applySuccessfulQueue(userId, config)
    } finally {
      this.recordingFlushFor.delete(userId)
    }
  }

  private async holdForSoleTurn(
    state: RoundRobinState,
  ): Promise<{ userId: string; hold: HeldQueueTrack } | null> {
    const eligible = getEligibleUserIds(state)
    if (eligible.length !== 1) return null
    const userId = eligible[0]!
    const hold = await this.loadHold(userId)
    if (!hold) return null
    return { userId, hold }
  }

  /** Run the flush after plugin event delivery, so the queue write is not inside `emit`. */
  private scheduleFlush(state: RoundRobinState, config: RoundRobinDjConfig): void {
    this.deferredFlush = { state, config }
    if (this.deferredTimer != null) return
    this.deferredTimer = setTimeout(() => {
      this.deferredTimer = null
      const pending = this.deferredFlush
      this.deferredFlush = null
      if (pending) void this.flushHoldForCurrentTurn(pending.state, pending.config)
    }, 0)
  }
}

function heldEnqueueFailure(message: string | undefined): string {
  return `Round Robin: could not add your held song (${message ?? "unknown error"}). Try adding again on your turn.`
}
