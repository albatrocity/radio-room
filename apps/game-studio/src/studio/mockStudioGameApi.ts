import type {
  ApplyModifierResult,
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
import { evaluateModifiers } from "@repo/game-logic"
import { buildSessionConfig } from "./buildSessionConfig"
import type { MockPluginLifecycle } from "./mockLifecycle"
import type { StudioRoom } from "./studioRoom"
import { checkModifierDefenseStudio } from "./studioDefense"
import { studioSystemMessage } from "./chatHelpers"
import { newId } from "./id"
import { pruneUserModifiers } from "./userStateHelpers"

export class MockStudioGameSessionApi implements GameSessionPluginAPI {
  constructor(
    private readonly room: StudioRoom,
    private readonly lifecycle: MockPluginLifecycle,
    private readonly pluginName: string,
  ) {}

  async getActiveSession(): Promise<GameSession | null> {
    return this.room.activeSession
  }

  async startSession(config: Partial<GameSessionConfig> & { name: string }): Promise<GameSession> {
    const full = buildSessionConfig(config)
    const session = this.room.startSession(full)
    await this.lifecycle.emit("GAME_SESSION_STARTED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      config: full,
    })
    this.room.logEvent("GAME_SESSION_STARTED", { sessionId: session.id })
    return session
  }

  async endSession(): Promise<GameSessionResults | null> {
    const session = this.room.activeSession
    if (!session) return null
    const endedAt = Date.now()
    const results = computeStudioResults(this.room, session, endedAt)
    await this.lifecycle.emit("GAME_SESSION_ENDED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      results,
    })
    this.room.logEvent("GAME_SESSION_ENDED", { sessionId: session.id })
    this.room.endSession()
    return results
  }

  registerAttributes(_definitions: PluginAttributeDefinition[]): void {
    // Studio: optional future UI — no-op
  }

  async addScore(
    userId: string,
    attribute: GameAttributeName,
    amount: number,
    reason?: string,
  ): Promise<number> {
    const session = this.room.activeSession
    if (!session) return 0
    this.room.ensureParticipant(userId)
    let state = this.room.getUserState(userId)!
    state = pruneUserModifiers(state, Date.now())
    const now = Date.now()
    const delta = evaluateModifiers(amount, attribute, state.modifiers, now)
    if (delta === null) {
      return state.attributes[attribute] ?? 0
    }
    const previousValue = state.attributes[attribute] ?? 0
    const nextValue = previousValue + delta
    state.attributes[attribute] = nextValue
    this.room.setUserState(state)
    this.room.updateLeaderboardScoresForAttribute(session, userId, attribute, nextValue)
    await this.lifecycle.emit("GAME_STATE_CHANGED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      userId,
      changes: [{ attribute, previousValue, value: nextValue, reason: reason ?? this.pluginName }],
    })
    return nextValue
  }

  async setScore(
    userId: string,
    attribute: GameAttributeName,
    value: number,
    reason?: string,
  ): Promise<number> {
    const session = this.room.activeSession
    if (!session) return 0
    this.room.ensureParticipant(userId)
    const state = this.room.getUserState(userId)!
    const previousValue = state.attributes[attribute] ?? 0
    state.attributes[attribute] = value
    this.room.setUserState(state)
    this.room.updateLeaderboardScoresForAttribute(session, userId, attribute, value)
    await this.lifecycle.emit("GAME_STATE_CHANGED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      userId,
      changes: [{ attribute, previousValue, value, reason: reason ?? this.pluginName }],
    })
    return value
  }

  async applyModifier(
    userId: string,
    modifier: Omit<GameStateModifier, "id" | "source">,
    options?: { actorUserId?: string },
  ): Promise<ApplyModifierResult> {
    const session = this.room.activeSession
    if (!session) return { ok: false, reason: "no_active_session" }
    this.room.ensureParticipant(userId)

    const blocked = checkModifierDefenseStudio(this.room, userId, this.pluginName, modifier)
    if (blocked) {
      const provisionalModifier: GameStateModifier = {
        ...modifier,
        id: "",
        source: this.pluginName,
      }
      await this.lifecycle.emit("GAME_EFFECT_BLOCKED", {
        roomId: this.room.roomId,
        sessionId: session.id,
        targetUserId: userId,
        actorUserId: options?.actorUserId,
        blockType: "modifier",
        modifier: provisionalModifier,
        blockedBy: {
          itemDefinitionId: blocked.itemDefinitionId,
          itemId: blocked.itemId,
          defenderUserId: blocked.defenderUserId,
          itemName: blocked.itemName,
        },
      })
      const actorName =
        (options?.actorUserId && this.room.users.get(options.actorUserId)?.username?.trim()) ||
        this.pluginName
      const targetName = this.room.users.get(userId)?.username?.trim() || userId
      const msg = `${actorName} attacked ${targetName}, but ${blocked.itemName} blocked it.`
      this.room.appendChat(
        studioSystemMessage(msg, { type: "alert", status: "warning", title: "Blocked" }),
      )
      return { ok: false, reason: "defense_blocked", blockingItemName: blocked.itemName }
    }

    const state = this.room.getUserState(userId)!
    const id = newId()
    const applied: GameStateModifier = { ...modifier, id, source: this.pluginName }
    let modifiers = [...state.modifiers]

    if (modifier.stackBehavior === "replace") {
      modifiers = modifiers.filter((m) => m.name !== modifier.name)
      modifiers.push(applied)
    } else if (modifier.stackBehavior === "extend") {
      const existing = modifiers.find((m) => m.name === modifier.name)
      if (existing) {
        existing.endAt = Math.max(existing.endAt, modifier.endAt)
        if (modifier.itemDefinitionId && !existing.itemDefinitionId) {
          existing.itemDefinitionId = modifier.itemDefinitionId
        }
        if (modifier.icon && !existing.icon) existing.icon = modifier.icon
        state.modifiers = modifiers
        this.room.setUserState(state)
        await this.lifecycle.emit("GAME_MODIFIER_APPLIED", {
          roomId: this.room.roomId,
          sessionId: session.id,
          userId,
          modifier: existing,
        })
        return { ok: true, modifierId: existing.id }
      }
      modifiers.push(applied)
    } else {
      const sameName = modifiers.filter((m) => m.name === modifier.name)
      if (modifier.maxStacks && sameName.length >= modifier.maxStacks) {
        const toRemove = sameName.length - modifier.maxStacks + 1
        const toRemoveIds = new Set(
          [...sameName].sort((a, b) => a.startAt - b.startAt).slice(0, toRemove).map((m) => m.id),
        )
        modifiers = modifiers.filter((m) => !toRemoveIds.has(m.id))
      }
      modifiers.push(applied)
    }

    state.modifiers = modifiers
    this.room.setUserState(state)

    await this.lifecycle.emit("GAME_MODIFIER_APPLIED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      userId,
      modifier: applied,
    })
    return { ok: true, modifierId: id }
  }

  async applyTimedModifier(
    userId: string,
    durationMs: number,
    modifier: Omit<GameStateModifier, "id" | "source" | "startAt" | "endAt">,
    actorUserId?: string,
  ): Promise<ApplyModifierResult> {
    const now = Date.now()
    let endAt = now + durationMs
    if (modifier.stackBehavior === "stack") {
      const state = (await this.getUserState(userId)) ?? null
      const sameName = (state?.modifiers ?? []).filter(
        (m) => m.name === modifier.name && m.startAt <= now && m.endAt > now,
      )
      if (sameName.length > 0) {
        const latestEndAt = Math.max(...sameName.map((m) => m.endAt))
        endAt = latestEndAt + durationMs
      }
    }
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

  async removeModifier(userId: string, modifierId: string): Promise<boolean> {
    const session = this.room.activeSession
    if (!session) return false
    const state = this.room.getUserState(userId)
    if (!state) return false
    const next = state.modifiers.filter((m) => m.id !== modifierId)
    if (next.length === state.modifiers.length) return false
    state.modifiers = next
    this.room.setUserState(state)
    await this.lifecycle.emit("GAME_MODIFIER_REMOVED", {
      roomId: this.room.roomId,
      sessionId: session.id,
      userId,
      modifierId,
      reason: "manual",
    })
    return true
  }

  async getUserState(userId: string): Promise<UserGameState | null> {
    if (!this.room.activeSession) return null
    const raw = this.room.getUserState(userId)
    if (!raw) return null
    return pruneUserModifiers(raw, Date.now())
  }

  async getLeaderboard(leaderboardId: string): Promise<GameLeaderboardEntry[]> {
    const session = this.room.activeSession
    if (!session) return []
    const cfg = session.config.leaderboards.find((l) => l.id === leaderboardId)
    if (!cfg) return []

    const scores = this.room.leaderboardScores.get(leaderboardId)
    if (!scores?.size) return []

    const rows = [...scores.entries()].map(([userId, value]) => ({
      userId,
      username: this.room.users.get(userId)?.username?.trim() ?? userId,
      value,
    }))
    rows.sort((a, b) => (cfg.sortOrder === "desc" ? b.value - a.value : a.value - b.value))
    const cap = cfg.showTop ?? rows.length
    return rows.slice(0, cap).map((r, i) => ({
      ...r,
      rank: i + 1,
    }))
  }
}

function computeStudioResults(
  room: StudioRoom,
  session: GameSession,
  endedAt: number,
): GameSessionResults {
  const participants = [...room.participants].map((userId) => ({
    userId,
    username: room.users.get(userId)?.username ?? userId,
    finalState: pruneUserModifiers(room.getUserState(userId)!, endedAt),
    finalInventory: [...(room.inventories.get(userId) ?? [])],
    rank: {} as Record<string, number>,
  }))
  return {
    sessionId: session.id,
    config: session.config,
    startedAt: session.startedAt,
    endedAt,
    participants,
    totals: {
      scoreAwarded: 0,
      coinsSpent: 0,
      itemsAcquired: 0,
      itemsUsed: 0,
      itemsTraded: 0,
    },
  }
}
