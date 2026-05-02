import {
  AppContext,
  GameAttributeName,
  GameLeaderboardEntry,
  GameSession,
  GameSessionConfig,
  GameSessionPluginAPI,
  GameSessionResults,
  GameStateModifier,
  PluginAttributeDefinition,
  UserGameState,
} from "@repo/types"
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
  ): Promise<number> {
    if (!this.service) return 0
    return this.service.addScore(
      this.roomId,
      userId,
      attribute,
      amount,
      reason ?? this.pluginName,
    )
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
  ): Promise<string> {
    if (!this.service) return ""
    return this.service.applyModifier(this.roomId, userId, this.pluginName, modifier)
  }

  async applyTimedModifier(
    userId: string,
    durationMs: number,
    modifier: Omit<GameStateModifier, "id" | "source" | "startAt" | "endAt">,
  ): Promise<string> {
    const now = Date.now()
    return this.applyModifier(userId, {
      ...modifier,
      startAt: now,
      endAt: now + durationMs,
    })
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
}
