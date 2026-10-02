import type { TripMap } from "@repo/road-trip-map"
import { isOptionalSite, routeMiles } from "@repo/road-trip-map"
import type { Leg, LegRates } from "./ledger"

export type TripStatus = "loaded" | "driving" | "arrived" | "late" | "ended" | "stranded"

export type BlockerKind = "parked" | "admin-pause" | "no-session"

export type Blocker = {
  id: string
  kind: BlockerKind
  since: number
  /** Wall-clock expiry (D8); expiries keep running while paused. */
  until?: number
  siteId?: string
}

/** Speed factors are a Phase 3 primitive; Phase 1 keeps the slot so the ledger math is final. */
export type SpeedFactor = { id: string; factor: number; until?: number; source: string }

/**
 * `ahead`: optional site awaiting its skip poll · `polling`: poll open ·
 * `stopping`: will park on arrival (mandatory, or the room chose to stop) ·
 * `parked` · `visited` · `skipped`.
 */
export type SitePhase = "ahead" | "polling" | "stopping" | "parked" | "visited" | "skipped"

export type SkipVotes = { stop: number; skip: number }

export type SiteRuntime = {
  phase: SitePhase
  revealed: boolean
  pollId?: string
  /** Option ids of the open poll: [stop, skip] by option order. */
  pollOptionIds?: [string, string]
  /** Earliest time to retry opening the poll after a conflict. */
  pollRetryAt?: number
  votes?: SkipVotes
  defaulted?: boolean
  visitedAt?: number
}

export type TripState = {
  version: number
  tripId: string
  seed: number
  status: TripStatus
  map: { id: string; revision: number; hash: string; title: string }
  baseMph: number
  routeMiles: number
  speedFactors: SpeedFactor[]
  blockers: Blocker[]
  sites: Record<string, SiteRuntime>
  departedAt?: number
  arrivedAt?: number
  endedAt?: number
  targetArrivalAt?: number
  /** Scope id of the site shop round currently open (D13). */
  shopScopeId?: string
  /**
   * The leg in force. Lives in state so a transition and its leg commit in
   * one CAS; `trip:legs` is append-only history for the export.
   */
  leg?: Leg
}

export type TripLogEntry = { at: number; mile: number } & TripLogEvent

export type TripLogEvent =
  | { kind: "departed" }
  | {
      kind: "site"
      siteId: string
      name: string
      phase: "revealed" | "poll" | "stopped" | "skipped" | "departed"
      votes?: SkipVotes
      defaulted?: boolean
    }
  | { kind: "pause"; reason: "admin" | "no-session" }
  | { kind: "resume"; reason: "admin" | "no-session" }
  | { kind: "arrived" | "late" | "stranded" | "ended"; deadlineAt?: string }

export const TRIP_STORAGE_KEYS = {
  MAP: "trip:map",
  STATE: "trip:state",
  LEGS: "trip:legs",
  LOG: "trip:log",
  ARMED: "trip:armed",
  SHOP_WARNING: "trip:shop-warning",
} as const

/** Armed durable schedules: id → fire time, so unchanged ones aren't rewritten. */
export type ArmedSchedules = Record<string, number>

export const MAX_LEGS = 5_000
export const MAX_LOG_ENTRIES = 3_000

export type StoredTripMap = { map: TripMap; hash: string; loadedAt: number; loadedBy?: string }

export function createTripState(stored: StoredTripMap, tripId: string, seed: number): TripState {
  const { map } = stored
  const sites: Record<string, SiteRuntime> = {}
  for (const site of map.sites) {
    sites[site.id] = { phase: isOptionalSite(site) ? "ahead" : "stopping", revealed: false }
  }
  return {
    version: 0,
    tripId,
    seed,
    status: "loaded",
    map: { id: map.id, revision: map.revision, hash: stored.hash, title: map.title },
    baseMph: map.route.baseMph,
    routeMiles: routeMiles(map.route),
    speedFactors: [],
    blockers: [],
    sites,
  }
}

function live<T extends { until?: number }>(items: T[], now: number): T[] {
  return items.filter((item) => item.until === undefined || item.until > now)
}

export function liveBlockers(state: TripState, now: number): Blocker[] {
  return live(state.blockers, now)
}

/** Speed with factors applied, ignoring blockers (for projections while stopped). */
export function cruisingMph(state: TripState, now: number): number {
  return live(state.speedFactors, now).reduce((mph, f) => mph * f.factor, state.baseMph)
}

/** `mph = driving && no live blockers ? baseMph × Π factors : 0` (D3, D4). Fuel is Phase 2. */
export function currentRates(state: TripState, now: number): LegRates {
  const moving = state.status === "driving" && liveBlockers(state, now).length === 0
  return { mph: moving ? cruisingMph(state, now) : 0, gpm: 0, engine: true }
}

export function isTripRunning(state: TripState): boolean {
  return state.status === "driving"
}
