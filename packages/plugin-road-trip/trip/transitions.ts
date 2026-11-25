import type { FundsMode, TripMap } from "@repo/road-trip-map"
import { fuelEvent, isGasSite, sortedSites } from "@repo/road-trip-map"
import { dispatch, flow } from "./flow"
import {
  ARRIVAL_MILE_EPSILON,
  BACK_ON_THE_ROAD,
  findSite,
  fundShareCopy,
  milesLabel,
  pct,
  seededIndex,
  type Transition,
  type TripEffect,
} from "./helpers"
import { resolveIncidentFund, startOrQueueIncident, startQueuedIncident } from "./incidents"
import {
  gallonsLeft,
  refillShownAfterFill,
  type Blocker,
  type FuelLevel,
  type FundPayment,
  type SkipVotes,
  type TripLogEvent,
  type TripState,
} from "./state"

/**
 * Pure trip transitions (ADR 0213). `mutateTrip` runs them inside a CAS, so
 * they must not touch I/O and may run more than once. Side effects are
 * returned as intents and executed once after the write succeeds. Incidents
 * live in `./incidents`. Phases (trip status, sites, votes) change only
 * through the trip flow (`./flow`, ADR 0222); the site wrappers here dispatch
 * flow events.
 */

export { gallonsOnArrival, gasUrgency, liveSkipDefault } from "./siteRules"

export {
  ARRIVAL_MILE_EPSILON,
  AUTOMATIC_FUND_HOLD_MS,
  formatShare,
  fundShareCopy,
  nextSiteAhead,
  PULL_OFF_HOLD_MILES,
  pullOffHold,
  siteShopScopeId,
  type SignVariant,
  type Transition,
  type TransitionContext,
  type TransitionResult,
  type TripEffect,
} from "./helpers"

// ---------------------------------------------------------------------------
// Departure and lifecycle
// ---------------------------------------------------------------------------

export const depart: Transition = dispatch({ type: "TRIP_DEPART" })

export const pauseTrip: Transition = (state, { now }) => {
  if (state.status !== "driving") return null
  if (state.blockers.some((b) => b.kind === "admin-pause")) return null
  const blocker: Blocker = { id: "admin-pause", kind: "admin-pause", since: now }
  return {
    next: { ...state, blockers: [...state.blockers, blocker] },
    log: [{ kind: "pause", reason: "admin" }],
    effects: [
      {
        type: "sign",
        variant: "warning",
        icon: "⏸",
        title: "Trip paused",
        body: "The van pulls onto the shoulder.",
      },
    ],
  }
}

export const resumeTrip: Transition = (state) => {
  if (state.status !== "driving") return null
  if (!state.blockers.some((b) => b.kind === "admin-pause")) return null
  return {
    next: { ...state, blockers: state.blockers.filter((b) => b.kind !== "admin-pause") },
    log: [{ kind: "resume", reason: "admin" }],
    effects: [BACK_ON_THE_ROAD],
  }
}

export const gameSessionEnded: Transition = (state, { now }) => {
  if (state.status !== "driving") return null
  if (state.blockers.some((b) => b.kind === "no-session")) return null
  const blocker: Blocker = { id: "no-session", kind: "no-session", since: now }
  return {
    next: { ...state, blockers: [...state.blockers, blocker] },
    log: [{ kind: "pause", reason: "no-session" }],
    effects: [
      {
        type: "sign",
        variant: "warning",
        icon: "⏸",
        title: "No game session",
        body: "The van waits on the shoulder until a game session starts.",
      },
    ],
  }
}

export const gameSessionStarted: Transition = (state) => {
  if (!state.blockers.some((b) => b.kind === "no-session")) return null
  return {
    next: { ...state, blockers: state.blockers.filter((b) => b.kind !== "no-session") },
    log: [{ kind: "resume", reason: "no-session" }],
    effects: state.status === "driving" ? [BACK_ON_THE_ROAD] : [],
  }
}

export const endTrip: Transition = dispatch({ type: "TRIP_END" })

// ---------------------------------------------------------------------------
// Sites: thin wrappers over the trip flow (ADR 0222)
// ---------------------------------------------------------------------------

export function revealSite(siteId: string): Transition {
  return dispatch({ type: "SITE_REVEAL", siteId })
}

/** The site's exit poll opened. Null (refused) means the plugin closes the poll again. */
export function markPolling(siteId: string, pollId: string, optionIds: string[]): Transition {
  return dispatch({ type: "VOTE_OPENED", target: { kind: "site", id: siteId }, pollId, optionIds })
}

export function deferPoll(siteId: string, retryAt: number): Transition {
  return dispatch({ type: "VOTE_DEFERRED", target: { kind: "site", id: siteId }, retryAt })
}

export type SkipDecisionInput = {
  /** Vote counts, when a poll ran. Undefined = no poll (apply default). */
  votes?: SkipVotes
  /** Only resolve if the site's open poll is this one (POLL_CLOSED path). */
  pollId?: string
}

/** Resolve an optional site's skip decision (poll closed, or no poll could run). */
export function resolveSkip(siteId: string, input: SkipDecisionInput = {}): Transition {
  return dispatch({
    type: "VOTE_CLOSED",
    target: { kind: "site", id: siteId },
    ...(input.pollId !== undefined ? { pollId: input.pollId } : {}),
    ...(input.votes ? { tally: [input.votes.stop, input.votes.skip] } : {}),
  })
}

export type ArrivalOptions = {
  /** The open exit poll's counts; otherwise read from `ctx.tallies`. */
  votes?: SkipVotes
}

/** The van reached a site's mile. Resolves an undecided skip first, then parks or drives past. */
export function arriveAtSite(siteId: string, input: ArrivalOptions = {}): Transition {
  const arrive = dispatch({ type: "SITE_ARRIVE", siteId })
  return (state, ctx) => {
    const pollId = state.sites[siteId]?.vote?.pollId
    if (!input.votes || !pollId) return arrive(state, ctx)
    return arrive(state, {
      ...ctx,
      tallies: { ...ctx.tallies, [pollId]: [input.votes.stop, input.votes.skip] },
    })
  }
}

/** End a parked stop: blocker off, shop closed, site visited; a queued incident starts. */
export function finishPark(siteId?: string): Transition {
  return (state, ctx) => {
    const blocker = state.blockers.find(
      (b) => b.kind === "parked" && (siteId === undefined || b.siteId === siteId),
    )
    if (!blocker?.siteId) return null
    const site = findSite(ctx.map, blocker.siteId)
    if (!site) return null
    const effects: TripEffect[] = []
    if (state.shopScopeId) effects.push({ type: "close-shop", scopeId: state.shopScopeId })
    const left = flow(
      {
        next: {
          ...state,
          blockers: state.blockers.filter((b) => b.id !== blocker.id),
          shopScopeId: undefined,
        },
        log: [],
        effects,
      },
      ctx,
      { type: "SITE_LEAVE", siteId: site.id },
    )
    const next = left.next
    const log: TripLogEvent[] = [
      ...left.log,
      { kind: "site", siteId: site.id, name: site.name, phase: "departed" },
    ]
    const queued = startQueuedIncident(next, ctx)
    if (queued) {
      return {
        next: queued.next,
        log: [...log, ...(queued.log ?? [])],
        effects: [...left.effects, ...(queued.effects ?? [])],
      }
    }
    // A gas fund still holding the van announces the departure when it resolves.
    const tail: TripEffect[] = state.status === "driving" && !next.fund ? [BACK_ON_THE_ROAD] : []
    return { next, log, effects: [...left.effects, ...tail] }
  }
}

/**
 * Expire a timed blocker. Fund holds aren't expired here: settling a fund
 * needs coin I/O, so the plugin settles it and then applies `resolveFund`.
 */
export function expireBlocker(blockerId: string): Transition {
  return (state, ctx) => {
    const blocker = state.blockers.find((b) => b.id === blockerId)
    if (!blocker || blocker.until === undefined || blocker.until > ctx.now) return null
    if (blocker.kind === "parked") return finishPark(blocker.siteId)(state, ctx)
    if (blocker.kind === "fund") return null
    return { next: { ...state, blockers: state.blockers.filter((b) => b.id !== blockerId) } }
  }
}

// ---------------------------------------------------------------------------
// Funds (D15–D18) and fuel (M2)
// ---------------------------------------------------------------------------

/** Switch how trip costs are paid. Only before departure (M1 Quick Access). */
export function setFundsMode(mode: FundsMode): Transition {
  return (state) => {
    if (state.status !== "loaded" || state.fundsMode === mode) return null
    return { next: { ...state, fundsMode: mode } }
  }
}

export type LevyOutcome = { collected: number; payers: number; rate: number; paid: FundPayment[] }

/**
 * Automatic mode: claim the fund for a levy before charging anyone. Null when
 * the fund is gone (settled or waived first), in which case nobody is charged.
 */
export function startLevy(fundId: string): Transition {
  return (state, { now }) => {
    const fund = state.fund
    if (!fund || fund.id !== fundId || fund.mode !== "automatic") return null
    if (fund.levyStartedAt !== undefined || fund.collected !== undefined) return null
    return { next: { ...state, fund: { ...fund, levyStartedAt: now } } }
  }
}

/** Keep a fund's hold up while its levy is still being recorded. */
export function extendFundHold(fundId: string, until: number): Transition {
  return (state) => {
    const fund = state.fund
    if (!fund || fund.id !== fundId || until <= fund.endsAt) return null
    return {
      next: {
        ...state,
        fund: { ...fund, endsAt: until },
        blockers: state.blockers.map((b) => (b.kind === "fund" ? { ...b, until } : b)),
      },
    }
  }
}

/** Automatic mode: record what the levy took. The van keeps "pumping" until the hold ends. */
export function recordLevy(fundId: string, outcome: LevyOutcome): Transition {
  return (state) => {
    if (state.fund?.id !== fundId || state.fund.collected !== undefined) return null
    return { next: { ...state, fund: { ...state.fund, ...outcome } } }
  }
}

export type FundOutcome = {
  collected: number
  payers: number
  topContributors?: FundPayment[]
  paid?: FundPayment[]
  /** The host skipped the step and anything taken was refunded. */
  waived?: boolean
  /**
   * Resolve even though a levy started and never recorded (its process died).
   * Only for a levy long past `LEVY_STALE_MS`; what it took is unknown.
   */
  abandonLevy?: boolean
}

const SHORT_GAS_COPY: ((collected: number, cost: number) => string)[] = [
  (collected, cost) =>
    `The attendant counts ${collected} of ${cost} coins, sighs, and fills the tank anyway.`,
  (collected, cost) => `${collected} of ${cost} coins. The attendant shrugs and tops you off.`,
  (collected, cost) =>
    `Short by ${cost - collected} coins. The attendant waves you off with a full tank.`,
]

/**
 * The fund step resolved. Gas fills to full however much was raised (D18) and
 * lifts the hold; an incident fund moves its incident to the next step.
 * Idempotent on the fund id.
 */
export function resolveFund(fundId: string, outcome: FundOutcome): Transition {
  return (state, ctx) => {
    const fund = state.fund
    if (!fund || fund.id !== fundId) return null
    const levyInFlight =
      fund.mode === "automatic" && fund.levyStartedAt !== undefined && fund.collected === undefined
    if (levyInFlight && !outcome.abandonLevy) return null
    if (fund.incidentId) return resolveIncidentFund(state, ctx, fund, outcome)
    const site = fund.siteId ? findSite(ctx.map, fund.siteId) : undefined
    const name = site?.name ?? "the gas station"
    const collected = Math.min(fund.cost, Math.max(0, Math.floor(outcome.collected)))
    const shown = refillShownAfterFill(
      state,
      Math.max(0, gallonsLeft(state, ctx.gallonsUsed)),
      ctx.now,
    )
    let next: TripState = {
      ...state,
      fund: undefined,
      blockers: state.blockers.filter((b) => b.kind !== "fund"),
      lastFill: {
        gallons: state.tankGallons,
        gallonsUsed: ctx.gallonsUsed,
        ...(shown ? { shown } : {}),
      },
      fuelFlags: [],
    }
    const gal = Math.round(fund.gallons * 10) / 10
    const body =
      collected < fund.cost
        ? SHORT_GAS_COPY[seededIndex(state.seed, fund.id, SHORT_GAS_COPY.length)]!(
            collected,
            fund.cost,
          )
        : `${collected} coins${fundShareCopy(fund, collected, outcome.payers)}. ${gal} gal in the tank.`
    const effects: TripEffect[] = [
      { type: "sign", variant: "success", icon: "⛽", title: `Filled up at ${name}`, body },
    ]
    const log: TripLogEvent[] = [
      {
        kind: "fund",
        purpose: fund.purpose,
        mode: fund.mode,
        ...(fund.siteId ? { siteId: fund.siteId } : {}),
        name,
        cost: fund.cost,
        collected,
        payers: outcome.payers,
        ...(outcome.topContributors?.length ? { topContributors: outcome.topContributors } : {}),
        ...(outcome.paid?.length ? { paid: outcome.paid } : {}),
      },
      { kind: "fuel", level: "filled", gallons: fund.gallons },
    ]
    const stillParked = next.blockers.some((b) => b.kind === "parked")
    if (state.status === "driving" && !stillParked && site) {
      const queued = startQueuedIncident(next, ctx)
      if (queued) {
        next = queued.next
        log.push(...(queued.log ?? []))
        effects.push(...(queued.effects ?? []))
      } else {
        effects.push(BACK_ON_THE_ROAD)
      }
    }
    return { next, log, effects }
  }
}

/** Why a Gas Canister can't be poured now, or null when it can (ADR 0228). */
export function pourRefusal(state: TripState, gallonsUsed: number): string | null {
  if (state.status !== "driving") return "Save it for the road."
  if (state.fuelFlags.includes("empty")) return "The tank's dry. Help is already on the way."
  if (gallonsLeft(state, gallonsUsed) >= state.tankGallons - 1e-6) return "The tank's already full."
  return null
}

/**
 * Gas Canister (ADR 0228): pour `gallons` into the tank while driving, capped
 * at the tank. Never ends an incident or a fund, and never skips a stop.
 */
export function pourGas(gallons: number, user: { userId: string; name: string }): Transition {
  return (state, ctx) => {
    if (pourRefusal(state, ctx.gallonsUsed)) return null
    const before = Math.max(0, gallonsLeft(state, ctx.gallonsUsed))
    const after = Math.min(state.tankGallons, before + gallons)
    const added = after - before
    const shown = refillShownAfterFill(state, before, ctx.now)
    const lowLine = fuelLine(state, ctx.map, "low")
    const next: TripState = {
      ...state,
      lastFill: { gallons: after, gallonsUsed: ctx.gallonsUsed, ...(shown ? { shown } : {}) },
      fuelFlags: after > lowLine + 1e-6 ? state.fuelFlags.filter((f) => f !== "low") : state.fuelFlags,
    }
    const gal = Math.round(added * 10) / 10
    return {
      next,
      log: [{ kind: "fuel", level: "poured", gallons: added, name: user.name }],
      effects: [
        {
          type: "sign",
          variant: "success",
          icon: "⛽",
          title: `${user.name} poured in a Gas Canister`,
          body: `${gal} gal in the tank · ${pct(after, state.tankGallons)}%`,
        },
      ],
    }
  }
}

/** Line the tank level crosses for a fuel threshold, in gallons. */
export function fuelLine(state: TripState, map: TripMap, level: FuelLevel): number {
  return level === "low" ? map.tuning.lowFuelPct * state.tankGallons : 0
}

/** Gas fell to `level` (M2). Empty starts the map's fuel event, else Out of Gas (M4, ADR 0228). */
export function fuelThreshold(level: FuelLevel): Transition {
  return (state, ctx) => {
    if (state.status !== "driving" || state.fuelFlags.includes(level)) return null
    const gallons = gallonsLeft(state, ctx.gallonsUsed)
    if (gallons > fuelLine(state, ctx.map, level) + 1e-6) return null
    const flags: FuelLevel[] = level === "empty" ? ["low", "empty"] : [...state.fuelFlags, level]
    const next: TripState = { ...state, fuelFlags: Array.from(new Set(flags)) }
    const log: TripLogEvent[] = [{ kind: "fuel", level, gallons: Math.max(0, gallons) }]
    if (level === "empty") {
      // Running dry as the van rolls into the destination: it coasts in.
      if (ctx.mile >= state.routeMiles - ARRIVAL_MILE_EPSILON) return { next, log }
      const started = startOrQueueIncident(next, ctx, {
        incident: fuelEvent(ctx.map).id,
        source: "fuel",
      })
      return { next: started.next, log: [...log, ...(started.log ?? [])], effects: started.effects }
    }
    const gas = sortedSites(ctx.map).find(
      (site) =>
        site.mile > ctx.mile &&
        isGasSite(site) &&
        state.sites[site.id]?.phase !== "skipped" &&
        state.sites[site.id]?.revealed,
    )
    return {
      next,
      log,
      effects: [
        {
          type: "sign",
          variant: "warning",
          icon: "⛽",
          title: `Low fuel · ${pct(gallons, state.tankGallons)}%`,
          body: gas
            ? `Next gas: ${gas.name}, ${milesLabel(gas.mile - ctx.mile)}`
            : "Keep an eye out for gas.",
        },
      ],
    }
  }
}
