import type {
  MetadataSourceAccessGrantParams,
  MetadataSourceAccessGrantResult,
  Plugin,
  PluginActionInitiator,
  PluginConfigSchema,
  PluginContext,
  QueueItem,
  QueueValidationParams,
  QueueValidationResult,
  User,
  UserPersonaAssignment,
} from "@repo/types"
import { allowQueueRequest, deferQueueRequest, rejectQueueRequest } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  defaultRoundRobinDjConfig,
  PLUGIN_NAME,
  ROBIN_PERSONA_ID,
  STATE_KEY,
  roundRobinDjConfigSchema,
  type HeldQueueTrack,
  type RoundRobinDjConfig,
  type RoundRobinState,
} from "./types"
import { getConfigSchema } from "./schema"
import {
  addDeputy,
  advanceRound,
  applyAdminRobin,
  applyModeChange,
  canAccessSources,
  canEnqueueNow,
  canHold,
  clearAdminRobin,
  createInitialState,
  isEligible,
  recordSuccessfulQueue,
  rejectionReason,
  removeUser,
  type StateTransition,
} from "./state"
import { HoldStore } from "./holds"
import { RobinPersonaSync } from "./personas"

export type { RoundRobinDjConfig, RoundRobinState, HeldQueueTrack } from "./types"
export { roundRobinDjConfigSchema, defaultRoundRobinDjConfig, ROBIN_PERSONA_ID } from "./types"
export {
  createInitialState,
  getEligibleUserIds,
  isEligible,
  canEnqueueNow,
  canHold,
  canAccessSources,
  recordSuccessfulQueue,
  addDeputy,
  removeUser,
  applyAdminRobin,
  clearAdminRobin,
  advanceRound,
  shouldUseExclusiveRobin,
} from "./state"

/**
 * Round Robin DJ Plugin
 *
 * Gates deputy queueing by round order (sequential or FCFS). Assigns a Robin
 * persona to eligible deputies and grants restricted metadata access to them.
 */
export class RoundRobinDjPlugin extends BasePlugin<RoundRobinDjConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description =
    "Round-robin deputy DJ queueing with sequential or FCFS rounds, Robin persona, and turn messages."

  static readonly configSchema = roundRobinDjConfigSchema as any
  static readonly defaultConfig = defaultRoundRobinDjConfig

  private readonly holds = new HoldStore({
    getContext: () => this.context,
    applySuccessfulQueue: (userId, config) => this.applySuccessfulQueue(userId, config),
  })

  private readonly robin = new RobinPersonaSync({
    getContext: () => this.context,
    getPersonas: () => this.personas,
  })

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("QUEUE_CHANGED", (data) => this.onQueueChanged(data))
    this.on("DEPUTY_DJ_CHANGED", (data) => this.onDeputyDjChanged(data))
    this.on("USER_LEFT", (data) => this.onUserLeft(data))
    this.on("USER_JOINED", (data) => this.onUserJoined(data))
    this.on("PERSONA_ASSIGNED", (data) => this.onPersonaAssigned(data))
    this.on("PERSONA_REMOVED", (data) => this.onPersonaRemoved(data))
    this.onConfigChange((data) => this.handleConfigChange(data))

    const config = await this.getConfig()
    if (config?.enabled) {
      await this.onPluginEnabled(config)
    }
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    _params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) return { success: false, message: "Plugin not ready" }

    if (action === "advanceRound") {
      if (!initiator?.userId) {
        return { success: false, message: "Admin required" }
      }
      const isAdmin = await this.context.api.isRoomAdmin(this.context.roomId, initiator.userId)
      if (!isAdmin) {
        return { success: false, message: "Admin required" }
      }

      const config = await this.getConfig()
      if (!config?.enabled) {
        return { success: false, message: "Round Robin DJ is not enabled" }
      }

      const state = await this.loadState()
      if (!state) {
        return { success: false, message: "No active round-robin state" }
      }

      const transition = advanceRound(state)
      await this.persistAndSync(transition, config)
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Round Robin: round ${transition.state.round} started`,
        { type: "alert", status: "info" },
      )
      return { success: true, message: `Advanced to round ${transition.state.round}` }
    }

    return { success: false, message: `Unknown action: ${action}` }
  }

  async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
    const config = await this.getConfig()
    if (!config?.enabled) return allowQueueRequest()

    const isAdmin = await this.context!.api.isRoomAdmin(params.roomId, params.userId)
    if (isAdmin) return allowQueueRequest()

    const state = await this.loadState()
    if (!state) return allowQueueRequest()

    if (canEnqueueNow(state, params.userId)) {
      return allowQueueRequest()
    }

    if (canHold(state, params.userId, config.deferOutOfTurnQueues)) {
      await this.holds.saveHold(params.userId, {
        trackId: params.trackId,
        mediaSourceType: params.mediaSourceType ?? "spotify",
        username: params.username,
        heldAt: Date.now(),
      })
      const forNextRound = !state.orderLocked
      await this.context!.api.sendUserSystemMessage(
        params.roomId,
        params.userId,
        forNextRound
          ? "Round Robin: song held for next round"
          : "Round Robin: song held until your turn",
        { type: "alert", status: "info" },
      )
      return deferQueueRequest(
        forNextRound
          ? "Song saved — it will be added on your turn next round"
          : "Song saved — it will be added when it's your turn",
      )
    }

    return rejectQueueRequest(rejectionReason(state))
  }

  async grantMetadataSourceAccess(
    params: MetadataSourceAccessGrantParams,
  ): Promise<MetadataSourceAccessGrantResult> {
    const config = await this.getConfig()
    if (!config?.enabled) return "abstain"

    const isAdmin = await this.context!.api.isRoomAdmin(params.roomId, params.userId)
    if (isAdmin) return "abstain"

    const state = await this.loadState()
    if (!state) return "abstain"

    return canAccessSources(state, params.userId, config.deferOutOfTurnQueues)
      ? "grant"
      : "abstain"
  }

  // ==========================================================================
  // Config lifecycle
  // ==========================================================================

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    if (!this.context) return

    const config = data.config as RoundRobinDjConfig
    const previousConfig = data.previousConfig as RoundRobinDjConfig | null
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    if (!wasEnabled && isEnabled) {
      await this.onPluginEnabled(config)
      return
    }

    if (wasEnabled && !isEnabled) {
      await this.onPluginDisabled()
      return
    }

    if (!isEnabled) return

    const modeChanged = previousConfig?.mode !== config.mode
    if (modeChanged) {
      const deputies = await this.currentDeputyIds()
      const prev = (await this.loadState()) ?? createInitialState(config.mode, deputies)
      await this.holds.clearHoldsForUsers(prev.participants)
      const state = applyModeChange(prev, config.mode, deputies)
      await this.saveState(state)
      await this.robin.sync(state)
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Round Robin: switched to ${config.mode === "sequential" ? "sequential" : "non-sequential"} mode`,
        { type: "alert", status: "info" },
      )
    }

    if (
      previousConfig?.deferOutOfTurnQueues === true &&
      config.deferOutOfTurnQueues === false
    ) {
      const state = await this.loadState()
      if (state) await this.holds.clearHoldsForUsers(state.participants)
    }
  }

  private async onPluginEnabled(config: RoundRobinDjConfig): Promise<void> {
    if (!this.context) return
    const deputies = await this.currentDeputyIds()
    const state = createInitialState(config.mode, deputies)
    await this.saveState(state)
    await this.robin.sync(state)
    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `Round Robin DJ enabled (${config.mode === "sequential" ? "sequential" : "non-sequential"}). Deputies take turns queueing.`,
      { type: "alert", status: "info" },
    )
  }

  private async onPluginDisabled(): Promise<void> {
    if (!this.context) return
    const state = await this.loadState()
    if (state) await this.holds.clearHoldsForUsers(state.participants)
    await this.robin.clearAssignments()
    await this.personas.unregisterPersonas()
    this.robin.reset()
    await this.context.storage.del(STATE_KEY)
    await this.context.api.sendSystemMessage(this.context.roomId, "Round Robin DJ disabled", {
      type: "alert",
      status: "info",
    })
  }

  // ==========================================================================
  // Event handlers
  // ==========================================================================

  private async onQueueChanged(data: {
    roomId: string
    queue: QueueItem[]
  }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    // Detect live enqueues via most-recent addedAt within 5s (same heuristic as queue-hygiene).
    // Hold flush records turns via applySuccessfulQueue — QUEUE_CHANGED may be suppressed.
    const sorted = [...data.queue].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    const mostRecent = sorted[0]
    if (!mostRecent?.addedBy?.userId || !mostRecent.addedAt) return
    if (Date.now() - mostRecent.addedAt >= 5000) return

    const userId = mostRecent.addedBy.userId
    if (userId.startsWith("plugin:")) return

    const state = await this.loadState()
    if (!state) return
    if (!state.participants.includes(userId)) return
    if (state.queuedThisRound.includes(userId)) return

    // Flush path records the turn itself; ignore QUEUE_CHANGED while that flush runs.
    if (this.holds.isRecordingFlushFor(userId)) return

    // Only advance turns for users who were eligible (admins who bypass still may be deputies)
    if (!isEligible(state, userId)) return

    // Real enqueue supersedes any hold
    await this.holds.clearHold(userId)
    await this.applySuccessfulQueue(userId, config, state)
  }

  private async onDeputyDjChanged(data: {
    roomId: string
    userId: string
    isDeputyDj: boolean
  }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const state = await this.loadState()
    if (!state) return

    if (data.isDeputyDj) {
      const next = addDeputy(state, data.userId)
      await this.saveState(next)
      await this.robin.sync(next)
    } else {
      await this.holds.clearHold(data.userId)
      const transition = removeUser(state, data.userId)
      await this.persistAndSync(transition, config)
    }
  }

  private async onUserLeft(data: { roomId: string; user: User }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const state = await this.loadState()
    if (!state) return
    if (!state.participants.includes(data.user.userId)) return

    await this.holds.clearHold(data.user.userId)
    const transition = removeUser(state, data.user.userId)
    await this.persistAndSync(transition, config)
  }

  private async onUserJoined(data: { roomId: string; user: User }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return
    if (!data.user.isDeputyDj) return

    const state = await this.loadState()
    if (!state) return
    if (state.participants.includes(data.user.userId)) return

    const next = addDeputy(state, data.user.userId)
    await this.saveState(next)
    await this.robin.sync(next)
  }

  private async onPersonaAssigned(data: {
    roomId: string
    userId: string
    personaId: string
  }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const fullId = `plugin:${this.name}:${ROBIN_PERSONA_ID}`
    if (data.personaId !== fullId) return

    const assignments = await this.personas.getUserPersonas(data.userId)
    const mine = assignments.find((a: UserPersonaAssignment) => a.personaId === fullId)
    if (!mine || mine.assignedBy === this.name) return

    const state = await this.loadState()
    if (!state) return

    const transition = applyAdminRobin(state, data.userId)
    await this.persistAndSync(transition, config)
    const [user] = await this.context.api.getUsersByIds([data.userId])
    const name = user?.username ?? "A deputy"
    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `Round Robin: ${name} designated as Robin`,
      { type: "alert", status: "info" },
    )
  }

  private async onPersonaRemoved(data: {
    roomId: string
    userId: string
    personaId: string
  }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return

    const fullId = `plugin:${this.name}:${ROBIN_PERSONA_ID}`
    if (data.personaId !== fullId) return

    const state = await this.loadState()
    if (!state) return
    if (state.adminForcedUserId !== data.userId) {
      await this.robin.sync(state)
      return
    }

    const next = clearAdminRobin(state)
    await this.saveState(next)
    await this.robin.sync(next)
    await this.holds.flushHoldForCurrentTurn(next, config)
  }

  // ==========================================================================
  // Persistence + turn sync
  // ==========================================================================

  private async loadState(): Promise<RoundRobinState | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(STATE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as RoundRobinState
    } catch {
      return null
    }
  }

  private async saveState(state: RoundRobinState): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(STATE_KEY, JSON.stringify(state))
  }

  /**
   * Shared turn persistence for live enqueues and hold flush.
   * No-ops if the user is already recorded for this round.
   */
  private async applySuccessfulQueue(
    userId: string,
    config: RoundRobinDjConfig,
    knownState?: RoundRobinState,
  ): Promise<void> {
    const state = knownState ?? (await this.loadState())
    if (!state) return
    if (state.queuedThisRound.includes(userId)) return

    const transition = recordSuccessfulQueue(state, userId, config.autoAdvanceRounds)
    await this.persistAndSync(transition, config)
    await this.announceRoundTransition(transition)
  }

  private async announceRoundTransition(transition: StateTransition): Promise<void> {
    if (!this.context) return
    if (transition.roundCompleted && !transition.roundAdvanced) {
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        "Round Robin: round complete — waiting for an admin to advance",
        { type: "alert", status: "info" },
      )
    } else if (transition.roundAdvanced) {
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Round Robin: round ${transition.state.round} started`,
        { type: "alert", status: "info" },
      )
    }
  }

  private async persistAndSync(
    transition: StateTransition,
    config: RoundRobinDjConfig,
  ): Promise<void> {
    await this.saveState(transition.state)
    await this.robin.sync(transition.state)
    await this.notifyTurnStarted(transition.turnStartedFor)
    await this.holds.flushHoldForCurrentTurn(transition.state, config)
  }

  private async currentDeputyIds(): Promise<string[]> {
    if (!this.context) return []
    const users = await this.context.api.getUsers(this.context.roomId)
    return users.filter((u) => u.isDeputyDj).map((u) => u.userId)
  }

  private async notifyTurnStarted(userIds: string[]): Promise<void> {
    if (!this.context || userIds.length === 0) return

    if (userIds.length === 1) {
      const userId = userIds[0]!
      const [user] = await this.context.api.getUsersByIds([userId])
      const name = user?.username ?? "Deputy"
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `Round Robin: it's ${name}'s turn to queue`,
        { type: "alert", status: "info" },
      )
      await this.context.api.sendUserSystemMessage(
        this.context.roomId,
        userId,
        "Round Robin: it's your turn to add a song",
        { type: "alert", status: "info" },
      )
    }
  }
}

export function createRoundRobinDjPlugin(
  configOverrides?: Partial<RoundRobinDjConfig>,
): Plugin {
  return new RoundRobinDjPlugin(configOverrides)
}

export default createRoundRobinDjPlugin
