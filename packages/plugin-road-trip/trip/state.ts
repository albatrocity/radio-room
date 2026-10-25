import type {
  EventFamily,
  FundsMode,
  IncidentStep,
  PartSlot,
  TripFundPurpose,
  TripMap,
  TripStoreRefill,
} from "@repo/road-trip-map"
import {
  baseGallonsPerMile,
  compileVan,
  eventRefuels,
  INCIDENT_PRESETS,
  isIncidentPresetId,
  INCIDENT_TIMING,
  isOptionalSite,
  PART_SLOTS,
  productOf,
  refillGallonsAt,
  routeMiles,
} from "@repo/road-trip-map"
import { project, type Leg, type LegRates } from "./ledger"

export type TripStatus = "loaded" | "driving" | "arrived" | "late" | "ended" | "stranded"

export type BlockerKind = "parked" | "admin-pause" | "no-session" | "fund" | "incident"

export type Blocker = {
  id: string
  kind: BlockerKind
  since: number
  /** Wall-clock expiry (D8); expiries keep running while paused. */
  until?: number
  siteId?: string
}

/** A timed speed change (a slow event). Installed parts compile to factors in `currentRates`. */
export type SpeedFactor = {
  id: string
  factor: number
  until?: number
  source: string
  /** Van tab copy ("Traffic jam"); falls back to `source`. */
  label?: string
}

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

/** Tank level at the last fill, against the ledger's `gallonsUsed` prefix sum (M2). */
export type FuelFill = {
  gallons: number
  gallonsUsed: number
  /** A fill with no pump time of its own: the gauge climbs across this window instead. */
  shown?: TripStoreRefill
}

export type FuelLevel = "low" | "empty"

/**
 * One cost step (D15). The cost is locked when the step opens. Automatic mode
 * collects straight away and holds the van for a short flavor delay; voluntary
 * mode holds it until the pool's window closes or its goal is met.
 */
export type TripFund = {
  id: string
  purpose: TripFundPurpose
  mode: FundsMode
  /** Gas site, or the Mechanic an incident fund is paid at; absent on the shoulder. */
  siteId?: string
  /** The incident this fund step belongs to (`ActiveIncident.id`). */
  incidentId?: string
  /** Who's being paid, for copy ("the tow truck", "Hank's Garage"). */
  provider?: string
  cost: number
  /** Gallons the step pays for: gas fills on resolve (D18), delivery when the truck arrives. */
  gallons: number
  openedAt: number
  endsAt: number
  /**
   * Automatic mode: set (in a CAS) before any coin moves. While it's set and
   * `collected` isn't, the fund can't resolve, so a levy in flight is never
   * settled as "0 collected".
   */
  levyStartedAt?: number
  /** Automatic mode: what the levy took, once collected. */
  collected?: number
  payers?: number
  rate?: number
  paid?: FundPayment[]
}

export type FundPayment = { userId: string; name: string; amount: number }

export type InstalledPart = { partId: string; userId: string; name: string; at: number }

export type IncidentSource = "host" | "scripted" | "fuel"

/** What an incident keeps from its event when it starts (ADR 0220). */
export type IncidentSnapshot = {
  name: string
  icon: string
  family: EventFamily
  clearedNarrative?: string
  /** The event refuels: the tank fills when the incident clears. */
  refuels: boolean
}

/** One incident at a time (M4); the rest wait in `incidentQueue`. */
export type ActiveIncident = IncidentSnapshot & {
  /** Unique per trip: `incident-<seq>`. */
  id: string
  /** Event id: a built-in preset id (host, default Out of Gas) or the map event's id. */
  incident: string
  source: IncidentSource
  /** Resolved when it started (Mechanic ahead, parts installed). */
  steps: IncidentStep[]
  step: number
  stepStartedAt: number
  /** Timed steps (`slow`, `window`, `wait`) end on their own then (D22). */
  stepEndsAt?: number
  /** The Mechanic the van was towed to; its shop stays open until the incident ends. */
  atSiteId?: string
  /** Where the tow picked the van up, for the "towed 3 mi" log. */
  towFromMile?: number
}

/**
 * `host` names a built-in preset; `scripted` a map event (`eventId`); `fuel`
 * the map's fuel event or the built-in Out of Gas.
 */
export type QueuedIncident = { incident: string; source: IncidentSource; eventId?: string }

/** A map event's timed narratives (ADR 0220), dropped when its incident clears. */
export type BeatRun = {
  eventId: string
  startedAt: number
  /** Beat indexes already posted. */
  fired: number[]
  /** The incident they belong to; absent for a narrative-only event. */
  incidentId?: string
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
  /** Base burn (D6: derived from tanks per trip); parts' mpg factors divide it. */
  baseGpm: number
  tankGallons: number
  lastFill: FuelFill
  /** Fuel thresholds already crossed since the last fill (each logs and signs once). */
  fuelFlags: FuelLevel[]
  /** From map tuning; switchable until departure. */
  fundsMode: FundsMode
  fund?: TripFund
  /** One part per slot (D20). */
  parts: Partial<Record<PartSlot, InstalledPart>>
  incident?: ActiveIncident
  incidentQueue: QueuedIncident[]
  /** Bumped per incident started, for unique incident ids. */
  incidentSeq: number
  /** Mile event ids already fired this run. */
  scriptedFired: string[]
  beatRuns: BeatRun[]
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
  | {
      kind: "fund"
      purpose: TripFundPurpose
      mode: FundsMode
      siteId?: string
      /** Gas station or provider name. */
      name: string
      cost: number
      collected: number
      payers: number
      topContributors?: FundPayment[]
      /** Per-payer coins, for the export's Travelers table. */
      paid?: FundPayment[]
      /** Event id of the incident the fund belongs to. */
      incident?: string
      /** The host skipped the step: nothing charged. */
      waived?: boolean
    }
  | { kind: "fuel"; level: FuelLevel | "filled"; gallons: number }
  | {
      kind: "incident"
      /** Event id. */
      incident: string
      /** The event's name and icon when it ran (absent on logs written before ADR 0220). */
      name?: string
      icon?: string
      source: IncidentSource
      /**
       * `started` · `noted` (a narrative-only event) · `immune` (a part shrugged
       * it off) · `resolved` (an item ended it) · `aaa` (a AAA Card paid a fee) ·
       * `towed` · `skipped` (host skipped a step) · `cleared` (over).
       */
      step:
        | "started"
        | "noted"
        | "immune"
        | "resolved"
        | "aaa"
        | "towed"
        | "skipped"
        | "cleared"
      resolvedBy?: { userId: string; name: string; itemId: string }
      /** `immune`: the part that shrugged it off. */
      partId?: string
      /** `cleared`: the tank filled. */
      refueled?: true
      siteId?: string
      siteName?: string
      miles?: number
    }
  | {
      kind: "part-installed"
      partId: string
      slot: PartSlot
      userId: string
      name: string
      replaced?: string
    }
  | { kind: "arrived" | "late" | "stranded" | "ended"; deadlineAt?: string }

export const TRIP_STORAGE_KEYS = {
  MAP: "trip:map",
  STATE: "trip:state",
  LEGS: "trip:legs",
  LOG: "trip:log",
  ARMED: "trip:armed",
  SHOP_WARNING: "trip:shop-warning",
  /** Voluntary-mode escrow (`EscrowPoolHelper`); its id is the fund id. */
  POOL: "trip:pool",
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
    baseGpm: baseGallonsPerMile(map),
    tankGallons: map.tuning.tankGallons,
    lastFill: { gallons: map.tuning.tankGallons, gallonsUsed: 0 },
    fuelFlags: [],
    fundsMode: map.tuning.funds.mode,
    parts: {},
    incidentQueue: [],
    incidentSeq: 0,
    scriptedFired: [],
    beatRuns: [],
  }
}

/** Fill Phase 3 and ADR 0220 fields on a state saved before they existed. */
export function normalizeTripState(state: TripState): TripState {
  const incident = state.incident
  const legacyIncident = incident !== undefined && incident.name === undefined
  if (state.parts && state.incidentQueue && state.scriptedFired && state.beatRuns && !legacyIncident) {
    return state
  }
  return {
    ...state,
    parts: state.parts ?? {},
    incidentQueue: state.incidentQueue ?? [],
    incidentSeq: state.incidentSeq ?? 0,
    scriptedFired: state.scriptedFired ?? [],
    beatRuns: state.beatRuns ?? [],
    ...(legacyIncident ? { incident: { ...legacySnapshot(incident.incident), ...incident } } : {}),
  }
}

/** An incident saved before ADR 0220 carried only its preset id. */
function legacySnapshot(id: string): IncidentSnapshot {
  if (!isIncidentPresetId(id)) return { name: id, icon: "⚠️", family: "none", refuels: false }
  const preset = INCIDENT_PRESETS[id]
  return {
    name: preset.name,
    icon: preset.icon,
    family: preset.family ?? "none",
    refuels: eventRefuels(preset),
    ...(preset.clearedNarrative ? { clearedNarrative: preset.clearedNarrative } : {}),
  }
}

/** Installed part short ids, in slot order. */
export function installedPartIds(state: Pick<TripState, "parts">): string[] {
  return PART_SLOTS.flatMap(({ slot }) => {
    const part = state.parts[slot]
    return part ? [part.partId] : []
  })
}

/** Burn per mile with parts' mpg factors applied. */
export function effectiveGpm(state: TripState): number {
  const mpg = productOf(compileVan(installedPartIds(state)).mpgFactors)
  return mpg > 0 ? state.baseGpm / mpg : state.baseGpm
}

/** The incident's current step, if any. */
export function currentIncidentStep(state: TripState): IncidentStep | undefined {
  return state.incident ? state.incident.steps[state.incident.step] : undefined
}

export function isTowing(state: TripState): boolean {
  return currentIncidentStep(state)?.kind === "tow"
}

/** Gallons in the tank for a ledger `gallonsUsed`; negative once the tank ran dry. */
export function gallonsLeft(state: Pick<TripState, "lastFill">, gallonsUsed: number): number {
  return state.lastFill.gallons - (gallonsUsed - state.lastFill.gallonsUsed)
}

/** How long the gauge climbs for a fill that has no pump time of its own. */
export const INSTANT_REFILL_SHOW_MS = 20_000

/**
 * A fill under way: the automatic pump, or the fuel truck's Refuelling wait.
 * The tank itself fills when the window ends.
 */
export function pendingRefill(state: TripState, gallons: number): TripStoreRefill | undefined {
  const fund = state.fund
  if (fund?.purpose === "gas" && fund.mode === "automatic") {
    return { fromGallons: gallons, startedAt: fund.openedAt, endsAt: fund.endsAt }
  }
  const incident = state.incident
  const step = currentIncidentStep(state)
  if (incident && step?.kind === "wait" && step.refills && incident.stepEndsAt !== undefined) {
    return { fromGallons: gallons, startedAt: incident.stepStartedAt, endsAt: incident.stepEndsAt }
  }
  return undefined
}

/**
 * The climb to record on `lastFill` when the tank fills now: none when the fill's
 * own window already played out, otherwise 20s from wherever the gauge stood.
 */
export function refillShownAfterFill(
  state: TripState,
  preGallons: number,
  now: number,
): TripStoreRefill | undefined {
  const pending = pendingRefill(state, preGallons)
  if (pending && now >= pending.endsAt) return undefined
  const fromGallons = pending ? refillGallonsAt(pending, state.tankGallons, now) : preGallons
  return { fromGallons, startedAt: now, endsAt: now + INSTANT_REFILL_SHOW_MS }
}

/** The refill the gauge should show at `now`, if any. */
export function refillInView(
  state: TripState,
  gallons: number,
  now: number,
): TripStoreRefill | undefined {
  const pending = pendingRefill(state, gallons)
  if (pending) return pending
  const shown = state.lastFill.shown
  return shown && now < shown.endsAt ? shown : undefined
}

/** Tank level at `now` from the leg in force, clamped at empty. */
export function tankAt(state: TripState, leg: Leg, now: number): number {
  return Math.max(0, gallonsLeft(state, project(leg, now).gallonsUsed))
}

function live<T extends { until?: number }>(items: T[], now: number): T[] {
  return items.filter((item) => item.until === undefined || item.until > now)
}

export function liveBlockers(state: TripState, now: number): Blocker[] {
  return live(state.blockers, now)
}

/** Speed with timed and part factors applied, ignoring blockers (for projections while stopped). */
export function cruisingMph(state: TripState, now: number): number {
  const parts = productOf(compileVan(installedPartIds(state)).speedFactors)
  return live(state.speedFactors, now).reduce((mph, f) => mph * f.factor, state.baseMph * parts)
}

export function towMph(state: TripState): number {
  return state.baseMph * INCIDENT_TIMING.towSpeedShare
}

/**
 * `mph = driving && no live blockers ? baseMph × Π factors : 0` (D3, D4);
 * `gpm = moving ? baseGpm ÷ Π mpg factors : 0`. A tow moves the van with the
 * engine off, so it burns nothing.
 */
export function currentRates(state: TripState, now: number): LegRates {
  const moving = state.status === "driving" && liveBlockers(state, now).length === 0
  if (moving && isTowing(state)) return { mph: towMph(state), gpm: 0, engine: false }
  return {
    mph: moving ? cruisingMph(state, now) : 0,
    gpm: moving ? effectiveGpm(state) : 0,
    engine: true,
  }
}

export function isTripRunning(state: TripState): boolean {
  return state.status === "driving"
}
