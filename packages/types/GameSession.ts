/**
 * Game Session Types
 *
 * Defines a global game state system that plugins can hook into.
 * Game Sessions provide:
 * - Per-user attributes (score, coin, plus plugin-namespaced custom attributes)
 * - Status modifiers with timed effects (e.g. "double_points" for 60s)
 * - Inventory of items defined by plugins (with cross-plugin visibility/usage)
 * - Configurable leaderboards derived from attributes
 *
 * See `docs/adrs/0040-game-sessions-and-inventory.md` for the architectural
 * rationale (core attributes vs. plugin-defined namespaces, why inventory is
 * core infrastructure, modifier expiry strategy, etc.).
 */

// ============================================================================
// Attributes
// ============================================================================

/**
 * Core game state attributes available to all plugins.
 * Cross-plugin readable AND writable.
 *
 * Start minimal — `score` and `coin` cover the common scoreboard / economy
 * use cases. Add additional well-known attributes here as new use cases emerge.
 */
export type CoreGameAttributeName = "score" | "coin"

/**
 * Plugin-defined attribute names are namespaced by plugin name to avoid
 * collisions, e.g. `"guess-the-tune:streak"` or `"playlist-democracy:reputation"`.
 *
 * Plugins should only write to:
 *   - Core attributes (`score`, `coin`)
 *   - Their own namespace (`<plugin-name>:<key>`)
 *
 * All plugins may read every attribute.
 */
export type PluginGameAttributeName = `${string}:${string}`

export type GameAttributeName = CoreGameAttributeName | PluginGameAttributeName

/**
 * Static metadata describing a plugin-defined attribute. Registered by the
 * owning plugin during `register()`; surfaced to the UI for discoverability.
 */
export interface PluginAttributeDefinition {
  /** Attribute key without the plugin namespace prefix (e.g. `"streak"`). */
  name: string
  /** Behaviour hint for the UI. */
  type: "counter" | "gauge" | "flag"
  description: string
  defaultValue: number
  /** Optional human-readable label for leaderboards / displays. */
  label?: string
}

// ============================================================================
// Modifiers
// ============================================================================

/**
 * Effects applied while a modifier is active.
 *
 * - `multiplier` / `additive`: applied when `addScore()` is called against the
 *   targeted attribute. Multiplicative effects compose by multiplication;
 *   additive effects compose by sum.
 * - `set`: clamps the attribute to the given value (overrides reads).
 * - `lock`: prevents `addScore()` / `setScore()` from changing the attribute
 *   while the modifier is active.
 * - `flag`: arbitrary boolean flag that plugins can read (e.g. `"silenced"`).
 *
 * Any variant may set optional `icon` (e.g. Lucide name in the web `ICON_MAP`) for UI.
 */
export type GameStateEffect =
  | { type: "multiplier"; target: GameAttributeName; value: number }
  | { type: "additive"; target: GameAttributeName; value: number }
  | { type: "set"; target: GameAttributeName; value: number }
  | { type: "lock"; target: GameAttributeName }
  | { type: "flag"; name: string; value: boolean }

export type GameStateEffectWithIcon = GameStateEffect & { icon?: string }

/** How a newly-applied modifier of the same `name` interacts with existing instances. */
export type ModifierStackBehavior = "replace" | "stack" | "extend"

export interface GameStateModifier {
  /** Unique instance ID assigned by `GameSessionService`. */
  id: string
  /** Logical name (e.g. `"double_points"`, `"poisoned"`). */
  name: string
  /** Plugin that applied the modifier. `"system"` for admin-applied. */
  source: string
  /** Effects applied while this modifier is active. */
  effects: GameStateEffectWithIcon[]
  /** Unix epoch (ms) when the modifier becomes active. */
  startAt: number
  /** Unix epoch (ms) when the modifier expires. */
  endAt: number
  /** How re-application interacts with an existing instance of the same name. */
  stackBehavior: ModifierStackBehavior
  /** Cap on stacks if `stackBehavior === "stack"`. Ignored otherwise. */
  maxStacks?: number
  /**
   * Optional icon key for the whole modifier row in UIs. When set, overrides
   * per-effect `icon` and item fallbacks.
   */
  icon?: string
  /**
   * When this modifier was caused by using an inventory item, that item’s
   * `ItemDefinition.id`. Used to resolve an icon after per-effect `icon` values.
   */
  itemDefinitionId?: string
}

/**
 * Derive boolean flags from non-expired `flag` effects on active modifiers.
 * `UserGameState.flags` may be unset; this is the canonical read path for
 * `GameStateEffect` of type `"flag"` when you already have a modifier list
 * (same time-window rules as `evaluateModifiers` in `GameSessionService`).
 */
export function getActiveFlags(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): Record<string, boolean> {
  const list = modifiers ?? []
  const flags: Record<string, boolean> = {}
  for (const modifier of list) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    for (const effect of modifier.effects) {
      if (effect.type === "flag") {
        flags[effect.name] = effect.value
      }
    }
  }
  return flags
}

// ============================================================================
// User game state
// ============================================================================

/**
 * The full game state for a single user inside an active session.
 *
 * `attributes` is a flat map keyed by `GameAttributeName` for both core and
 * plugin-defined values. Empty/zero values may be omitted.
 */
export interface UserGameState {
  userId: string
  attributes: Record<GameAttributeName, number>
  modifiers: GameStateModifier[]
  /** Optional flags toggled via `flag` effects (e.g. `silenced: true`). */
  flags?: Record<string, boolean>
}

/**
 * Delta describing an attribute change emitted on `GAME_STATE_CHANGED`.
 * Allows the UI to animate / reconcile without re-fetching full state.
 */
export interface GameStateChange {
  attribute: GameAttributeName
  /** Value before the change. Omitted on initial set. */
  previousValue?: number
  /** Value after the change. */
  value: number
  /** Optional reason for the change (plugin name, action, item, etc.). */
  reason?: string
}

// ============================================================================
// Leaderboards
// ============================================================================

export interface LeaderboardConfig {
  /** Stable id used for hydration / store keys. */
  id: string
  /** Attribute the leaderboard sorts on. */
  attribute: GameAttributeName
  sortOrder: "desc" | "asc"
  /** Display name (e.g. `"High Scores"`). */
  displayName: string
  /** Optional cap on rendered rows. Server may still return more on request. */
  showTop?: number
}

/**
 * Hydrated leaderboard row returned by `GameSessionPluginAPI.getLeaderboard`.
 * (Distinct from the simpler `LeaderboardEntry` used by the existing
 * declarative leaderboard component, which lives in `PluginComponent.ts`.)
 */
export interface GameLeaderboardEntry {
  userId: string
  username: string
  rank: number
  value: number
}

// ============================================================================
// Sessions
// ============================================================================

export type GameSessionStatus = "pending" | "active" | "ended"

export type GameSessionMode = "individual" | "team"

export interface TeamConfig {
  id: string
  name: string
  /** Optional ordered userIds. May be assigned when users join the room. */
  members?: string[]
}

/**
 * Configuration for starting a session. Most fields are optional with sensible
 * defaults so plugins / segments can omit boilerplate.
 */
export interface GameSessionConfig {
  /** Stable id. Auto-generated when starting an ad-hoc session. */
  id: string
  name: string
  /** Optional human-readable description shown in the UI. */
  description?: string

  /** Subset of attributes considered "active" for this session. */
  enabledAttributes: GameAttributeName[]
  /** Initial values applied to each user joining the session. */
  initialValues: Partial<Record<GameAttributeName, number>>

  /** Leaderboard configurations (by attribute). */
  leaderboards: LeaderboardConfig[]

  /** Optional auto-start timestamp (ms). */
  startsAt?: number
  /** Optional auto-end timestamp (ms). Mutually exclusive with `duration`. */
  endsAt?: number
  /** Optional auto-end duration (ms after `startsAt`). */
  duration?: number

  mode: GameSessionMode
  teams?: TeamConfig[]

  /** Segment that owns the session (auto-start/end on activation). */
  segmentId?: string

  /** Inventory settings. */
  inventoryEnabled: boolean
  maxInventorySlots: number
  allowTrading: boolean
  allowSelling: boolean
}

export interface GameSession {
  id: string
  roomId: string
  config: GameSessionConfig
  status: GameSessionStatus
  startedAt: number
  endedAt?: number
}

// ============================================================================
// Session results / export
// ============================================================================

export interface GameSessionParticipantResult {
  userId: string
  username: string
  finalState: UserGameState
  finalInventory: import("./Inventory").InventoryItem[]
  /** Final rank per leaderboard id. */
  rank: Record<string, number>
}

export interface GameSessionResults {
  sessionId: string
  config: GameSessionConfig
  startedAt: number
  endedAt: number
  participants: GameSessionParticipantResult[]
  totals: {
    scoreAwarded: number
    coinsSpent: number
    itemsAcquired: number
    itemsUsed: number
    itemsTraded: number
  }
}
