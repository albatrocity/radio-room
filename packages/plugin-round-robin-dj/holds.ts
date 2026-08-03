import type { PluginContext } from "@repo/types"
import { getEligibleUserIds } from "./state"
import type { HeldQueueTrack, RoundRobinDjConfig, RoundRobinState } from "./types"

const HOLD_KEY_PREFIX = "hold"

export type HoldStoreDeps = {
  getContext: () => PluginContext | null
  /** Record a successful queue add (turn advance + round messages). */
  applySuccessfulQueue: (userId: string, config: RoundRobinDjConfig) => Promise<void>
}

/**
 * Pending out-of-turn / next-round track holds and flush-on-turn.
 */
export class HoldStore {
  /** Prevents nested QUEUE_CHANGED from double-recording a flush we apply ourselves. */
  private recordingFlushFor = new Set<string>()

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
    for (const userId of userIds) {
      await this.clearHold(userId)
    }
  }

  /**
   * If the current turn holder has a pending track, enqueue it and advance their turn.
   *
   * Uses `runPluginValidation: false` so we do not re-enter `deferQueueRequest` (the hold
   * was already accepted). Clears the hold only after a successful add, then records the
   * turn locally — nested QUEUE_CHANGED is ignored via `recordingFlushFor`.
   */
  async flushHoldForCurrentTurn(
    state: RoundRobinState,
    config: RoundRobinDjConfig,
  ): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    const eligible = getEligibleUserIds(state)
    if (eligible.length !== 1) return

    const userId = eligible[0]!
    const hold = await this.loadHold(userId)
    if (!hold) return

    this.recordingFlushFor.add(userId)
    try {
      const result = await context.api.addToTrackQueue(context.roomId, hold.trackId, {
        addedBy: { type: "user", userId, username: hold.username },
        // Do not re-run validators: deferOutOfTurnQueues would hold again, and other
        // plugins (e.g. queue-hygiene) can reject right after the previous deputy queued.
        runPluginValidation: false,
        mediaSourceType: hold.mediaSourceType,
        // Avoid nested QUEUE_CHANGED during the previous deputy's emit; DJService
        // rebroadcasts a fresh snapshot after plugins return so the held track
        // lands at the live end of the queue on the client.
        suppressQueueChanged: true,
      })

      if (!result.success) {
        await context.api.sendUserSystemMessage(
          context.roomId,
          userId,
          `Round Robin: could not add your held song (${result.message}). Try adding again on your turn.`,
          { type: "alert", status: "error" },
        )
        return
      }

      await this.clearHold(userId)

      // Advance RR even when QUEUE_CHANGED is suppressed/nested (shared with live path).
      await this.deps.applySuccessfulQueue(userId, config)
    } finally {
      this.recordingFlushFor.delete(userId)
    }
  }
}
