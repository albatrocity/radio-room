import {
  AppContext,
  AddScoreOptions,
  ApplyModifierResult,
  CheckModifierDefenseResult,
  EconomyScaleState,
  EconomySnapshot,
  GameAttributeName,
  GameLeaderboardEntry,
  GameSession,
  GameSessionConfig,
  GameSessionPluginAPI,
  GameSessionResults,
  GameStateModifier,
  PresentedIdentityGrantInput,
  PluginAttributeDefinition,
  UserGameState,
} from "@repo/types"
import { defaultEconomyScaleState } from "@repo/game-logic"
import { GameSessionService } from "../../services/GameSessionService"

/**
 * Per-plugin, per-room view onto the {@link GameSessionService}.
 *
 * This is what plugins receive as `context.game`. It hides the room id
 * (always the plugin's room) and tags `applyModifier` writes with the
 * calling plugin name as `source`.
 */
export class PluginGameSessionAPI implements GameSessionPluginAPI {
  constructor(
    private readonly context: AppContext,
    private readonly pluginName: string,
    private readonly roomId: string,
  ) {}

  private get service(): GameSessionService | null {
    return (this.context.gameSessions as GameSessionService | undefined) ?? null
  }

  async getActiveSession(): Promise<GameSession | null> {
    if (!this.service) return null
    return this.service.getActiveSession(this.roomId)
  }

  async startSession(
    config: Partial<GameSessionConfig> & { name: string },
  ): Promise<GameSession> {
    if (!this.service) {
      throw new Error("[PluginGameSessionAPI] GameSessionService not initialised")
    }
    return this.service.startSession(this.roomId, config)
  }

  async endSession(): Promise<GameSessionResults | null> {
    if (!this.service) return null
    return this.service.endSession(this.roomId)
  }

  registerAttributes(definitions: PluginAttributeDefinition[]): void {
    if (!this.service) return
    // Fire-and-forget; plugin schema discovery is non-critical.
    this.service
      .registerAttributeDefinitions(this.roomId, this.pluginName, definitions)
      .catch((err) => {
        console.error(
          `[PluginGameSessionAPI] registerAttributes failed for ${this.pluginName}:`,
          err,
        )
      })
  }

  async addScore(
    userId: string,
    attribute: GameAttributeName,
    amount: number,
    reason?: string,
    options?: AddScoreOptions,
  ): Promise<number> {
    if (!this.service) return 0
    return this.service.addScore(
      this.roomId,
      userId,
      attribute,
      amount,
      reason ?? this.pluginName,
      options,
    )
  }

  async addScores(
    userId: string,
    changes: { attribute: GameAttributeName; amount: number }[],
    reason?: string,
    options?: AddScoreOptions,
  ): Promise<number[]> {
    if (!this.service) return changes.map(() => 0)
    return this.service.addScores(
      this.roomId,
      userId,
      changes,
      reason ?? this.pluginName,
      options,
    )
  }

  async getEconomyScale(): Promise<EconomyScaleState> {
    if (!this.service) return defaultEconomyScaleState(0)
    return this.service.getEconomyScale(this.roomId)
  }

  async setEconomyScale(
    patch: { costScale?: number; earnScale?: number },
    reason?: string,
  ): Promise<EconomyScaleState | null> {
    if (!this.service) return null
    const session = await this.service.setEconomyScale(this.roomId, patch, {
      updatedBy: "plugin",
      reason: reason ?? this.pluginName,
    })
    return session ? session.config.economy ?? null : null
  }

  async getEconomySnapshot(): Promise<EconomySnapshot | null> {
    if (!this.service) return null
    return this.service.getEconomySnapshot(this.roomId)
  }

  async setScore(
    userId: string,
    attribute: GameAttributeName,
    value: number,
    reason?: string,
  ): Promise<number> {
    if (!this.service) return 0
    return this.service.setScore(
      this.roomId,
      userId,
      attribute,
      value,
      reason ?? this.pluginName,
    )
  }

  async applyModifier(
    userId: string,
    modifier: Omit<GameStateModifier, "id" | "source">,
    options?: { actorUserId?: string },
  ): Promise<ApplyModifierResult> {
    if (!this.service) return { ok: false, reason: "no_active_session" }
    return this.service.applyModifier(this.roomId, userId, this.pluginName, modifier, options)
  }

  async applyTimedModifier(
    userId: string,
    durationMs: number,
    modifier: Omit<GameStateModifier, "id" | "source" | "startAt" | "endAt">,
    actorUserId?: string,
  ): Promise<ApplyModifierResult> {
    const now = Date.now()
    const endAt = await this.computeTimedEndAt(userId, modifier, durationMs, now)
    return this.applyModifier(
      userId,
      {
        ...modifier,
        startAt: now,
        endAt,
      },
      { actorUserId },
    )
  }

  async checkModifierDefense(
    userId: string,
    modifier: Omit<GameStateModifier, "id" | "source">,
    actorUserId?: string,
    options?: { omitBlockedModifier?: boolean },
  ): Promise<CheckModifierDefenseResult> {
    if (!this.service) return { ok: false, reason: "no_active_session" }
    return this.service.checkModifierDefense(this.roomId, userId, this.pluginName, modifier, {
      actorUserId,
      omitBlockedModifier: options?.omitBlockedModifier,
    })
  }

  async reboundModifier(
    userId: string,
    modifier: Omit<GameStateModifier, "id" | "source">,
    options?: { actorUserId?: string },
  ): Promise<ApplyModifierResult> {
    if (!this.service) return { ok: false, reason: "no_active_session" }
    const now = Date.now()
    const durationMs = Math.max(1, modifier.endAt - modifier.startAt)
    const endAt = await this.computeTimedEndAt(userId, modifier, durationMs, now)
    return this.service.applyModifier(
      this.roomId,
      userId,
      this.pluginName,
      { ...modifier, startAt: now, endAt },
      { actorUserId: options?.actorUserId, skipPassiveDefenseCheck: true },
    )
  }

  /**
   * For `stackBehavior: "stack"`, accumulate remaining time from the
   * longest-lived active same-name modifier so repeated applications visibly
   * tail off: existing stacks keep their `endAt`; the new stack carries the
   * extra time.
   */
  private async computeTimedEndAt(
    userId: string,
    modifier: Pick<GameStateModifier, "name" | "stackBehavior">,
    durationMs: number,
    now: number,
  ): Promise<number> {
    if (modifier.stackBehavior !== "stack") return now + durationMs
    const state = await this.getUserState(userId)
    const sameName = (state?.modifiers ?? []).filter(
      (m) => m.name === modifier.name && m.startAt <= now && m.endAt > now,
    )
    if (sameName.length === 0) return now + durationMs
    const latestEndAt = Math.max(...sameName.map((m) => m.endAt))
    return latestEndAt + durationMs
  }

  async removeModifier(userId: string, modifierId: string): Promise<boolean> {
    if (!this.service) return false
    return this.service.removeModifier(this.roomId, userId, modifierId)
  }

  async getUserState(userId: string): Promise<UserGameState | null> {
    if (!this.service) return null
    const session = await this.service.getActiveSession(this.roomId)
    if (!session) return null
    return this.service.getUserState(this.roomId, userId)
  }

  async getLeaderboard(leaderboardId: string): Promise<GameLeaderboardEntry[]> {
    if (!this.service) return []
    return this.service.getLeaderboard(this.roomId, leaderboardId)
  }

  async grantPresentedIdentity(
    input: Omit<PresentedIdentityGrantInput, "source"> & { source?: string },
  ) {
    const { grantPresentedIdentity } = await import("../../operations/presentedIdentity")
    return grantPresentedIdentity({
      context: this.context,
      roomId: this.roomId,
      input: { ...input, source: input.source ?? this.pluginName },
    })
  }

  async getPresentedIdentity(userId: string) {
    const { getPresentedIdentity } = await import("../../operations/presentedIdentity")
    return getPresentedIdentity({
      context: this.context,
      roomId: this.roomId,
      userId,
    })
  }

  async clearPresentedIdentity(userId: string) {
    const { clearPresentedIdentity } = await import("../../operations/presentedIdentity")
    return clearPresentedIdentity({
      context: this.context,
      roomId: this.roomId,
      userId,
    })
  }
}
