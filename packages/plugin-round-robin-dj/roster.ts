import type { PluginContext } from "@repo/types"
import { HoldStore } from "./holds"
import {
  addDeputy,
  createInitialState,
  removeUser,
} from "./state"
import type { RoundRobinDjConfig, RoundRobinState } from "./types"

export type FinalizeAfterStateChange = (
  state: RoundRobinState,
  config: RoundRobinDjConfig,
  options?: { turnStartedFor?: string[]; flush?: boolean },
) => Promise<void>

export type DeputyRosterDeps = {
  getContext: () => PluginContext | null
  getCachedConfig: () => Promise<RoundRobinDjConfig | null>
  loadState: () => Promise<RoundRobinState | null>
  saveState: (state: RoundRobinState) => Promise<void>
  holds: HoldStore
  currentDeputyIds: () => Promise<string[]>
  finalizeAfterStateChange: FinalizeAfterStateChange
}

/**
 * Deputy roster mutations for DEPUTY_DJ_CHANGED / DEPUTY_BULK_APPLIED / join-while-deputy.
 * Coalesces Robin + QUEUE_STATUS work onto one macrotask; bulk cancels and reconciles once.
 */
export class DeputyRosterLifecycle {
  private deputySyncTimer: ReturnType<typeof setTimeout> | null = null
  private pendingTurnStartedFor: string[] = []

  constructor(private readonly deps: DeputyRosterDeps) {}

  cancelScheduledSync(): void {
    if (this.deputySyncTimer == null) return
    clearTimeout(this.deputySyncTimer)
    this.deputySyncTimer = null
  }

  /**
   * Add a deputy to RR state and schedule coalesced finalize
   * (shared by DEPUTY_DJ_CHANGED and USER_JOINED while deputy).
   */
  async addDeputyAndSchedule(userId: string): Promise<void> {
    const config = await this.deps.getCachedConfig()
    if (!config?.enabled) return

    const state = await this.deps.loadState()
    if (!state) return
    if (state.participants.includes(userId)) return

    await this.deps.saveState(addDeputy(state, userId))
    this.scheduleSync()
  }

  async onDeputyDjChanged(data: {
    roomId: string
    userId: string
    isDeputyDj: boolean
  }): Promise<void> {
    if (!this.deps.getContext()) return
    const config = await this.deps.getCachedConfig()
    if (!config?.enabled) return

    const state = await this.deps.loadState()
    if (!state) return

    if (data.isDeputyDj) {
      await this.deps.saveState(addDeputy(state, data.userId))
    } else {
      await this.deps.holds.clearHold(data.userId)
      const transition = removeUser(state, data.userId)
      await this.deps.saveState(transition.state)
      this.pendingTurnStartedFor.push(...transition.turnStartedFor)
    }

    this.scheduleSync()
  }

  async onDeputyBulkApplied(data: {
    roomId: string
    action: "deputize_all" | "dedeputize_all"
  }): Promise<void> {
    if (!this.deps.getContext()) return
    const config = await this.deps.getCachedConfig()
    if (!config?.enabled) return

    this.cancelScheduledSync()
    this.pendingTurnStartedFor = []

    if (data.action === "dedeputize_all") {
      const state = await this.deps.loadState()
      if (!state) return
      await this.deps.holds.clearHoldsForUsers(state.participants)
      const next = createInitialState(config.mode, [])
      next.round = state.round
      await this.deps.saveState(next)
      await this.deps.finalizeAfterStateChange(next, config, { flush: false })
      return
    }

    const deputies = await this.deps.currentDeputyIds()
    let state = (await this.deps.loadState()) ?? createInitialState(config.mode, [])

    for (const userId of [...state.participants]) {
      if (!deputies.includes(userId)) {
        await this.deps.holds.clearHold(userId)
        state = removeUser(state, userId).state
      }
    }
    for (const userId of deputies) {
      state = addDeputy(state, userId)
    }

    await this.deps.saveState(state)
    await this.deps.finalizeAfterStateChange(state, config)
  }

  private scheduleSync(): void {
    if (this.deputySyncTimer != null) return
    this.deputySyncTimer = setTimeout(() => {
      this.deputySyncTimer = null
      void this.runCoalescedSync()
    }, 0)
  }

  private async runCoalescedSync(): Promise<void> {
    if (!this.deps.getContext()) return
    const config = await this.deps.getCachedConfig()
    if (!config?.enabled) return

    const state = await this.deps.loadState()
    if (!state) return

    const turnStarted = [...new Set(this.pendingTurnStartedFor)]
    this.pendingTurnStartedFor = []

    await this.deps.finalizeAfterStateChange(state, config, {
      turnStartedFor: turnStarted,
    })
  }
}
