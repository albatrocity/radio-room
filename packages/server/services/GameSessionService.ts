import {
  AppContext,
  GameAttributeName,
  GameLeaderboardEntry,
  GameSession,
  GameSessionConfig,
  GameSessionParticipantResult,
  GameSessionResults,
  GameSessionStatus,
  GameStateChange,
  GameStateModifier,
  PluginAttributeDefinition,
  UserGameState,
} from "@repo/types"
import generateId from "../lib/generateId"

// ============================================================================
// Default config helpers
// ============================================================================

const DEFAULT_INVENTORY_SLOTS = 3

/**
 * Fill in defaults for an incoming session config. The plan keeps the
 * configuration surface area small by shipping sensible defaults so plugins
 * / segments can pass `{ name }` and get a usable session.
 */
export function buildSessionConfig(
  partial: Partial<GameSessionConfig> & { name: string },
): GameSessionConfig {
  const id = partial.id ?? generateId()
  const enabledAttributes: GameAttributeName[] =
    partial.enabledAttributes ?? (["score", "coin"] as GameAttributeName[])
  const initialValues = partial.initialValues ?? {}
  const leaderboards =
    partial.leaderboards ??
    enabledAttributes.map((attribute) => ({
      id: attribute,
      attribute,
      sortOrder: "desc" as const,
      displayName: attribute === "coin" ? "Richest" : `${attribute[0]?.toUpperCase()}${attribute.slice(1)}`,
    }))

  return {
    id,
    name: partial.name,
    description: partial.description,
    enabledAttributes,
    initialValues,
    leaderboards,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt,
    duration: partial.duration,
    mode: partial.mode ?? "individual",
    teams: partial.teams,
    segmentId: partial.segmentId,
    inventoryEnabled: partial.inventoryEnabled ?? true,
    maxInventorySlots: partial.maxInventorySlots ?? DEFAULT_INVENTORY_SLOTS,
    allowTrading: partial.allowTrading ?? false,
    allowSelling: partial.allowSelling ?? false,
  }
}

// ============================================================================
// Redis key helpers
// ============================================================================

/**
 * Key namespace overview (see ADR 0040):
 *
 *   room:{roomId}:game:active                        -> sessionId of active session
 *   room:{roomId}:game:session:{sessionId}           -> JSON GameSession
 *   room:{roomId}:game:session:{sessionId}:user:{userId}:state -> JSON UserGameState
 *   room:{roomId}:game:session:{sessionId}:user:{userId}:modifiers -> JSON GameStateModifier[]
 *   room:{roomId}:game:session:{sessionId}:lb:{leaderboardId} -> ZSET userId -> attributeValue
 *   room:{roomId}:game:session:{sessionId}:participants -> SET of userIds
 *   room:{roomId}:game:attribute-defs                 -> HASH "<plugin>:<name>" -> JSON
 */
function activeSessionKey(roomId: string): string {
  return `room:${roomId}:game:active`
}
function sessionKey(roomId: string, sessionId: string): string {
  return `room:${roomId}:game:session:${sessionId}`
}
function userStateKey(roomId: string, sessionId: string, userId: string): string {
  return `${sessionKey(roomId, sessionId)}:user:${userId}:state`
}
function userModifiersKey(roomId: string, sessionId: string, userId: string): string {
  return `${sessionKey(roomId, sessionId)}:user:${userId}:modifiers`
}
function leaderboardKey(roomId: string, sessionId: string, leaderboardId: string): string {
  return `${sessionKey(roomId, sessionId)}:lb:${leaderboardId}`
}
function participantsKey(roomId: string, sessionId: string): string {
  return `${sessionKey(roomId, sessionId)}:participants`
}
function attributeDefsKey(roomId: string): string {
  return `room:${roomId}:game:attribute-defs`
}

// ============================================================================
// Modifier evaluation
// ============================================================================

/**
 * Compute the effective delta to apply to `attribute` given the user's active
 * modifiers, splitting multipliers and additives as documented on
 * `GameStateEffect`.
 *
 * Returns `null` when the attribute is locked (caller should skip the change).
 */
function evaluateModifiers(
  amount: number,
  attribute: GameAttributeName,
  modifiers: GameStateModifier[],
  now: number,
): number | null {
  let multiplier = 1
  let additive = 0

  for (const modifier of modifiers) {
    if (modifier.startAt > now || modifier.endAt <= now) continue

    for (const effect of modifier.effects) {
      if (effect.type === "lock" && effect.target === attribute) {
        return null
      }
      if (effect.type === "multiplier" && effect.target === attribute) {
        multiplier *= effect.value
      } else if (effect.type === "additive" && effect.target === attribute) {
        additive += effect.value
      }
    }
  }

  return amount * multiplier + additive
}

/**
 * Pure helper that prunes expired modifiers and returns the surviving array
 * along with the ids that were removed (used by callers to emit events).
 */
export function pruneExpiredModifiers(
  modifiers: GameStateModifier[],
  now: number,
): { active: GameStateModifier[]; expired: GameStateModifier[] } {
  const active: GameStateModifier[] = []
  const expired: GameStateModifier[] = []
  for (const modifier of modifiers) {
    if (modifier.endAt <= now) {
      expired.push(modifier)
    } else {
      active.push(modifier)
    }
  }
  return { active, expired }
}

// ============================================================================
// GameSessionService
// ============================================================================

/**
 * GameSessionService manages session lifecycle, per-user game state, modifier
 * application/expiry, and leaderboard reads.
 *
 * One instance is created per server (held on `AppContext.gameSessions`).
 * Per-room state lives in Redis so the service is stateless across restarts.
 *
 * Modifier expiry follows option (1) from the plan: a single periodic ticker
 * scans active sessions and emits `GAME_MODIFIER_REMOVED` events for expiring
 * modifiers. Lazy expiry (option 2) is also enforced inside `evaluateModifiers`
 * for accuracy when reads outpace ticks.
 */
export class GameSessionService {
  private readonly context: AppContext
  /** Periodic ticker handle for modifier expiry; `null` until `start()` is called. */
  private tickHandle: NodeJS.Timeout | null = null
  /** How often to scan for expired modifiers (ms). */
  private readonly tickIntervalMs: number

  constructor(context: AppContext, options?: { tickIntervalMs?: number }) {
    this.context = context
    this.tickIntervalMs = options?.tickIntervalMs ?? 1000
  }

  /** Start the modifier expiry ticker. Idempotent. */
  start(): void {
    if (this.tickHandle) return
    this.tickHandle = setInterval(() => {
      this.tick().catch((err) => {
        console.error("[GameSessionService] tick failed:", err)
      })
    }, this.tickIntervalMs)
    if (typeof this.tickHandle === "object" && "unref" in this.tickHandle) {
      this.tickHandle.unref()
    }
  }

  /** Stop the modifier expiry ticker. */
  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle)
      this.tickHandle = null
    }
  }

  // ==========================================================================
  // Session lifecycle
  // ==========================================================================

  async getActiveSession(roomId: string): Promise<GameSession | null> {
    const sessionId = await this.context.redis.pubClient.get(activeSessionKey(roomId))
    if (!sessionId) return null
    return this.getSession(roomId, sessionId)
  }

  async getSession(roomId: string, sessionId: string): Promise<GameSession | null> {
    const raw = await this.context.redis.pubClient.get(sessionKey(roomId, sessionId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as GameSession
    } catch (e) {
      console.error("[GameSessionService] Failed to parse session", sessionId, e)
      return null
    }
  }

  /**
   * Start a new session, ending any existing active session for the room.
   * Emits `GAME_SESSION_STARTED` once persisted.
   */
  async startSession(
    roomId: string,
    config: Partial<GameSessionConfig> & { name: string },
  ): Promise<GameSession> {
    const existing = await this.getActiveSession(roomId)
    if (existing && existing.status === "active") {
      await this.endSession(roomId)
    }

    const fullConfig = buildSessionConfig(config)
    const now = Date.now()
    const session: GameSession = {
      id: fullConfig.id,
      roomId,
      config: fullConfig,
      status: "active",
      startedAt: now,
    }

    const tx = this.context.redis.pubClient.multi()
    tx.set(sessionKey(roomId, session.id), JSON.stringify(session))
    tx.set(activeSessionKey(roomId), session.id)
    await tx.exec()

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "GAME_SESSION_STARTED", {
        roomId,
        sessionId: session.id,
        config: fullConfig,
      })
    }

    return session
  }

  /**
   * End the active session, computing final results.
   * Emits `GAME_SESSION_ENDED` and clears the active pointer.
   *
   * Resolves to `null` if there is no active session.
   */
  async endSession(roomId: string): Promise<GameSessionResults | null> {
    const session = await this.getActiveSession(roomId)
    if (!session) return null

    const endedAt = Date.now()
    const results = await this.computeResults(roomId, session, endedAt)

    const ended: GameSession = { ...session, status: "ended" as GameSessionStatus, endedAt }
    const tx = this.context.redis.pubClient.multi()
    tx.set(sessionKey(roomId, session.id), JSON.stringify(ended))
    tx.del(activeSessionKey(roomId))
    await tx.exec()

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "GAME_SESSION_ENDED", {
        roomId,
        sessionId: session.id,
        results,
      })
    }

    return results
  }

  // ==========================================================================
  // Attribute definitions
  // ==========================================================================

  /**
   * Persist a plugin's attribute definitions. Storing them on the room enables
   * future UI surfaces (attribute pickers, leaderboard config UIs) to discover
   * the available attributes without each plugin having to advertise them.
   */
  async registerAttributeDefinitions(
    roomId: string,
    pluginName: string,
    definitions: PluginAttributeDefinition[],
  ): Promise<void> {
    if (definitions.length === 0) return
    const fields: Record<string, string> = {}
    for (const def of definitions) {
      const fqn = `${pluginName}:${def.name}`
      fields[fqn] = JSON.stringify({ ...def, sourcePlugin: pluginName })
    }
    await this.context.redis.pubClient.hSet(attributeDefsKey(roomId), fields)
  }

  async getAttributeDefinitions(
    roomId: string,
  ): Promise<Record<string, PluginAttributeDefinition & { sourcePlugin: string }>> {
    const all = await this.context.redis.pubClient.hGetAll(attributeDefsKey(roomId))
    const out: Record<string, PluginAttributeDefinition & { sourcePlugin: string }> = {}
    for (const [k, v] of Object.entries(all)) {
      try {
        out[k] = JSON.parse(v)
      } catch {
        // skip malformed entries
      }
    }
    return out
  }

  // ==========================================================================
  // State mutations
  // ==========================================================================

  /**
   * Add `amount` to the user's `attribute`, applying multiplier/additive
   * modifiers. Locked attributes return the unchanged value.
   *
   * Resolves to the final stored value.
   */
  async addScore(
    roomId: string,
    userId: string,
    attribute: GameAttributeName,
    amount: number,
    reason?: string,
  ): Promise<number> {
    const session = await this.getActiveSession(roomId)
    if (!session) return 0

    const state = await this.getUserState(roomId, userId)
    const now = Date.now()

    const delta = evaluateModifiers(amount, attribute, state.modifiers, now)
    if (delta === null) {
      return state.attributes[attribute] ?? 0
    }

    const previousValue = state.attributes[attribute] ?? 0
    const nextValue = previousValue + delta
    state.attributes[attribute] = nextValue

    await this.persistUserState(roomId, session.id, state)
    await this.updateLeaderboards(roomId, session, userId, attribute, nextValue)
    await this.touchParticipant(roomId, session.id, userId)

    await this.emitStateChange(roomId, session.id, userId, [
      { attribute, previousValue, value: nextValue, reason },
    ])

    return nextValue
  }

  async setScore(
    roomId: string,
    userId: string,
    attribute: GameAttributeName,
    value: number,
    reason?: string,
  ): Promise<number> {
    const session = await this.getActiveSession(roomId)
    if (!session) return 0

    const state = await this.getUserState(roomId, userId)
    const previousValue = state.attributes[attribute] ?? 0
    state.attributes[attribute] = value

    await this.persistUserState(roomId, session.id, state)
    await this.updateLeaderboards(roomId, session, userId, attribute, value)
    await this.touchParticipant(roomId, session.id, userId)

    await this.emitStateChange(roomId, session.id, userId, [
      { attribute, previousValue, value, reason },
    ])

    return value
  }

  // ==========================================================================
  // Modifiers
  // ==========================================================================

  /**
   * Apply a modifier to a user. Stacking semantics:
   *
   * - `replace`: existing instances of the same name are removed first.
   * - `extend`:  existing instance of the same name has its `endAt` extended
   *              by the duration of the incoming modifier. The new modifier
   *              is otherwise discarded.
   * - `stack`:   appends; honours `maxStacks` by removing the oldest until
   *              the count fits.
   */
  async applyModifier(
    roomId: string,
    userId: string,
    sourcePlugin: string,
    incoming: Omit<GameStateModifier, "id" | "source">,
  ): Promise<string> {
    const session = await this.getActiveSession(roomId)
    if (!session) return ""

    const state = await this.getUserState(roomId, userId)
    const id = generateId()
    const modifier: GameStateModifier = { ...incoming, id, source: sourcePlugin }

    let modifiers = state.modifiers

    if (incoming.stackBehavior === "replace") {
      modifiers = modifiers.filter((m) => m.name !== incoming.name)
      modifiers.push(modifier)
    } else if (incoming.stackBehavior === "extend") {
      const existing = modifiers.find((m) => m.name === incoming.name)
      if (existing) {
        existing.endAt = Math.max(existing.endAt, incoming.endAt)
        // Don't push the new modifier - we extended the existing one
        await this.persistModifiers(roomId, session.id, userId, modifiers)
        await this.touchParticipant(roomId, session.id, userId)
        if (this.context.systemEvents) {
          await this.context.systemEvents.emit(roomId, "GAME_MODIFIER_APPLIED", {
            roomId,
            sessionId: session.id,
            userId,
            modifier: existing,
          })
        }
        return existing.id
      }
      modifiers.push(modifier)
    } else {
      // stack
      const sameName = modifiers.filter((m) => m.name === incoming.name)
      if (incoming.maxStacks && sameName.length >= incoming.maxStacks) {
        // Remove oldest of same name to make room
        const toRemove = sameName.length - incoming.maxStacks + 1
        const toRemoveIds = new Set(
          [...sameName].sort((a, b) => a.startAt - b.startAt).slice(0, toRemove).map((m) => m.id),
        )
        modifiers = modifiers.filter((m) => !toRemoveIds.has(m.id))
      }
      modifiers.push(modifier)
    }

    state.modifiers = modifiers
    await this.persistUserState(roomId, session.id, state)
    await this.touchParticipant(roomId, session.id, userId)

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "GAME_MODIFIER_APPLIED", {
        roomId,
        sessionId: session.id,
        userId,
        modifier,
      })
    }

    return id
  }

  async removeModifier(roomId: string, userId: string, modifierId: string): Promise<boolean> {
    const session = await this.getActiveSession(roomId)
    if (!session) return false

    const state = await this.getUserState(roomId, userId)
    const next = state.modifiers.filter((m) => m.id !== modifierId)
    if (next.length === state.modifiers.length) return false

    state.modifiers = next
    await this.persistUserState(roomId, session.id, state)

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "GAME_MODIFIER_REMOVED", {
        roomId,
        sessionId: session.id,
        userId,
        modifierId,
        reason: "manual",
      })
    }

    return true
  }

  // ==========================================================================
  // Reads
  // ==========================================================================

  /**
   * Get a user's full game state. Returns a freshly-initialised state with
   * the session's `initialValues` if no record exists yet.
   */
  async getUserState(roomId: string, userId: string): Promise<UserGameState> {
    const session = await this.getActiveSession(roomId)
    if (!session) {
      return { userId, attributes: {} as Record<GameAttributeName, number>, modifiers: [], flags: {} }
    }

    const raw = await this.context.redis.pubClient.get(userStateKey(roomId, session.id, userId))
    if (!raw) {
      return this.initialUserState(session.config, userId)
    }

    try {
      const parsed = JSON.parse(raw) as UserGameState
      // Lazy-prune expired modifiers on read (option 2 from the plan).
      const { active } = pruneExpiredModifiers(parsed.modifiers ?? [], Date.now())
      return { ...parsed, modifiers: active }
    } catch (e) {
      console.error("[GameSessionService] Failed to parse user state", userId, e)
      return this.initialUserState(session.config, userId)
    }
  }

  async getLeaderboard(
    roomId: string,
    leaderboardId: string,
  ): Promise<GameLeaderboardEntry[]> {
    const session = await this.getActiveSession(roomId)
    if (!session) return []

    const config = session.config.leaderboards.find((lb) => lb.id === leaderboardId)
    if (!config) return []

    const raw = await this.context.redis.pubClient.zRangeWithScores(
      leaderboardKey(roomId, session.id, leaderboardId),
      0,
      config.showTop ? config.showTop - 1 : -1,
      config.sortOrder === "desc" ? { REV: true } : undefined,
    )

    if (!raw || raw.length === 0) return []

    // Hydrate usernames (best-effort).
    const userIds = raw.map((r) => r.value)
    const { getUsersByIds } = await import("../operations/data")
    const users = await getUsersByIds({ context: this.context, userIds })
    const userMap = new Map(users.map((u) => [u.userId, u.username]))

    return raw.map((entry, index) => ({
      userId: entry.value,
      username: userMap.get(entry.value) ?? entry.value,
      rank: index + 1,
      value: entry.score,
    }))
  }

  // ==========================================================================
  // Lifecycle hooks for room cleanup
  // ==========================================================================

  /**
   * Clear all game session state for a room (used when a room is deleted).
   */
  async cleanupRoom(roomId: string): Promise<void> {
    try {
      const pattern = `room:${roomId}:game:*`
      const keys = await this.context.redis.pubClient.keys(pattern)
      if (keys.length > 0) {
        await this.context.redis.pubClient.del(keys)
      }
    } catch (error) {
      console.error("[GameSessionService] cleanupRoom failed:", error)
    }
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  private initialUserState(config: GameSessionConfig, userId: string): UserGameState {
    const attributes: Record<GameAttributeName, number> = {} as Record<GameAttributeName, number>
    for (const attr of config.enabledAttributes) {
      attributes[attr] = config.initialValues[attr] ?? 0
    }
    return { userId, attributes, modifiers: [], flags: {} }
  }

  private async persistUserState(
    roomId: string,
    sessionId: string,
    state: UserGameState,
  ): Promise<void> {
    await this.context.redis.pubClient.set(
      userStateKey(roomId, sessionId, state.userId),
      JSON.stringify(state),
    )
  }

  private async persistModifiers(
    roomId: string,
    sessionId: string,
    userId: string,
    modifiers: GameStateModifier[],
  ): Promise<void> {
    const state = await this.getUserState(roomId, userId)
    state.modifiers = modifiers
    await this.persistUserState(roomId, sessionId, state)
  }

  private async touchParticipant(
    roomId: string,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    await this.context.redis.pubClient.sAdd(participantsKey(roomId, sessionId), userId)
  }

  private async updateLeaderboards(
    roomId: string,
    session: GameSession,
    userId: string,
    attribute: GameAttributeName,
    value: number,
  ): Promise<void> {
    const matching = session.config.leaderboards.filter((lb) => lb.attribute === attribute)
    if (matching.length === 0) return
    const tx = this.context.redis.pubClient.multi()
    for (const lb of matching) {
      tx.zAdd(leaderboardKey(roomId, session.id, lb.id), [{ score: value, value: userId }])
    }
    await tx.exec()
  }

  private async emitStateChange(
    roomId: string,
    sessionId: string,
    userId: string,
    changes: GameStateChange[],
  ): Promise<void> {
    if (!this.context.systemEvents) return
    await this.context.systemEvents.emit(roomId, "GAME_STATE_CHANGED", {
      roomId,
      sessionId,
      userId,
      changes,
    })
  }

  private async computeResults(
    roomId: string,
    session: GameSession,
    endedAt: number,
  ): Promise<GameSessionResults> {
    const userIds = await this.context.redis.pubClient.sMembers(
      participantsKey(roomId, session.id),
    )

    const { getUsersByIds } = await import("../operations/data")
    const users = await getUsersByIds({ context: this.context, userIds })
    const usernameById = new Map(users.map((u) => [u.userId, u.username]))

    // Pre-compute per-leaderboard ranks once.
    const leaderboardRanks: Record<string, Map<string, number>> = {}
    for (const lb of session.config.leaderboards) {
      const entries = await this.getLeaderboard(roomId, lb.id)
      const map = new Map<string, number>()
      for (const entry of entries) {
        map.set(entry.userId, entry.rank)
      }
      leaderboardRanks[lb.id] = map
    }

    let scoreAwarded = 0
    let coinsSpent = 0

    const participants: GameSessionParticipantResult[] = []
    for (const userId of userIds) {
      const finalState = await this.getUserState(roomId, userId)
      const rank: Record<string, number> = {}
      for (const lb of session.config.leaderboards) {
        const r = leaderboardRanks[lb.id]?.get(userId)
        if (r != null) rank[lb.id] = r
      }
      const finalInventory = await this.readUserInventory(roomId, userId)
      participants.push({
        userId,
        username: usernameById.get(userId) ?? userId,
        finalState,
        finalInventory,
        rank,
      })
      scoreAwarded += finalState.attributes.score ?? 0
      // Coin "spent" approximated as negative balance changes is impossible to
      // know from final state alone; left as 0 for now.
    }

    const totalsKey = `${sessionKey(roomId, session.id)}:totals`
    const totalsRaw = await this.context.redis.pubClient.hGetAll(totalsKey)
    const itemsAcquired = Number(totalsRaw?.itemsAcquired ?? 0)
    const itemsUsed = Number(totalsRaw?.itemsUsed ?? 0)
    const itemsTraded = Number(totalsRaw?.itemsTraded ?? 0)
    coinsSpent = Number(totalsRaw?.coinsSpent ?? 0)

    return {
      sessionId: session.id,
      config: session.config,
      startedAt: session.startedAt,
      endedAt,
      participants,
      totals: { scoreAwarded, coinsSpent, itemsAcquired, itemsUsed, itemsTraded },
    }
  }

  /**
   * Inventory data lives in `InventoryService`; importing dynamically avoids a
   * circular dependency at module init.
   */
  private async readUserInventory(roomId: string, userId: string) {
    const { InventoryService } = await import("./InventoryService")
    const svc = new InventoryService(this.context)
    const inv = await svc.getInventory(roomId, userId)
    return inv.items
  }

  // ==========================================================================
  // Modifier expiry ticker
  // ==========================================================================

  /**
   * Scan all rooms with active sessions, remove expired modifiers, and emit
   * `GAME_MODIFIER_REMOVED` for each. Errors per-room are logged and skipped
   * so one bad room can't stall the whole tick.
   */
  private async tick(): Promise<void> {
    const activeKeys = await this.context.redis.pubClient.keys("room:*:game:active")
    if (activeKeys.length === 0) return

    const now = Date.now()

    for (const activeKey of activeKeys) {
      // activeKey = "room:{roomId}:game:active"
      const roomId = activeKey.split(":")[1]
      if (!roomId) continue

      try {
        const session = await this.getActiveSession(roomId)
        if (!session) continue

        const userIds = await this.context.redis.pubClient.sMembers(
          participantsKey(roomId, session.id),
        )

        for (const userId of userIds) {
          const stateRaw = await this.context.redis.pubClient.get(
            userStateKey(roomId, session.id, userId),
          )
          if (!stateRaw) continue
          let state: UserGameState
          try {
            state = JSON.parse(stateRaw)
          } catch {
            continue
          }

          const { active, expired } = pruneExpiredModifiers(state.modifiers ?? [], now)
          if (expired.length === 0) continue

          state.modifiers = active
          await this.persistUserState(roomId, session.id, state)

          if (this.context.systemEvents) {
            for (const m of expired) {
              await this.context.systemEvents.emit(roomId, "GAME_MODIFIER_REMOVED", {
                roomId,
                sessionId: session.id,
                userId,
                modifierId: m.id,
                reason: "expired",
              })
            }
          }
        }
      } catch (err) {
        console.error("[GameSessionService] tick error for room", roomId, err)
      }
    }
  }

  // ==========================================================================
  // Helpers used by other services (InventoryService) — exported as needed
  // ==========================================================================

  /** Increment a totals counter for the active session (used by InventoryService). */
  async incrementSessionTotal(
    roomId: string,
    field: "itemsAcquired" | "itemsUsed" | "itemsTraded" | "coinsSpent",
    by = 1,
  ): Promise<void> {
    const session = await this.getActiveSession(roomId)
    if (!session) return
    await this.context.redis.pubClient.hIncrBy(
      `${sessionKey(roomId, session.id)}:totals`,
      field,
      by,
    )
  }
}
