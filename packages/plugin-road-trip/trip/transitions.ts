import type { FundsMode, SkipDefault, TripMap, TripSite } from "@repo/road-trip-map"
import {
  effectiveSkipDefault,
  gasCost,
  isDestination,
  isGasSite,
  milesToNextGas,
  parkPlan,
  resolveSiteSettings,
  sortedSites,
} from "@repo/road-trip-map"
import {
  ARRIVAL_MILE_EPSILON,
  AUTOMATIC_FUND_HOLD_MS,
  backOnTheRoad,
  exitTitle,
  findSite,
  fundShareCopy,
  milesLabel,
  nextSiteAhead,
  openShopAt,
  pct,
  seededIndex,
  withSite,
  type Transition,
  type TransitionContext,
  type TransitionResult,
  type TripEffect,
} from "./helpers"
import { resolveIncidentFund, startOrQueueIncident, startQueuedIncident } from "./incidents"
import {
  effectiveGpm,
  gallonsLeft,
  type Blocker,
  type FuelLevel,
  type FundPayment,
  type SiteRuntime,
  type SkipVotes,
  type TripFund,
  type TripLogEvent,
  type TripState,
} from "./state"

/**
 * Pure trip transitions (ADR 0200). `mutateTrip` runs them inside a CAS, so
 * they must not touch I/O and may run more than once. Side effects are
 * returned as intents and executed once after the write succeeds. Incidents
 * live in `./incidents`.
 */

export {
  ARRIVAL_MILE_EPSILON,
  AUTOMATIC_FUND_HOLD_MS,
  formatShare,
  fundShareCopy,
  nextSiteAhead,
  siteShopScopeId,
  type SignVariant,
  type Transition,
  type TransitionContext,
  type TransitionResult,
  type TripEffect,
} from "./helpers"

/** Gallons in the tank when the van reaches `site`, at the current burn and without refills. */
export function gallonsOnArrival(
  state: TripState,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): number {
  const left = gallonsLeft(state, ctx.gallonsUsed)
  return Math.max(0, left - Math.max(0, site.mile - ctx.mile) * effectiveGpm(state))
}

/** A site's no-vote default with fuel known: low on arrival at a gas site means "stop". */
export function liveSkipDefault(
  state: TripState,
  map: TripMap,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): SkipDefault {
  return effectiveSkipDefault(map, site, gallonsOnArrival(state, site, ctx))
}

/**
 * Urgent gas copy for a low-fuel gas site's poll ("⛽ 12% · last gas for
 * 20 mi"); null when the site sells no gas or the tank isn't low.
 */
export function gasUrgency(
  state: TripState,
  map: TripMap,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): string | null {
  if (!isGasSite(site)) return null
  const gallons = gallonsOnArrival(state, site, ctx)
  if (effectiveSkipDefault(map, site, gallons) !== "stop") return null
  if (gallons >= map.tuning.lowFuelPct * state.tankGallons) return null
  const after = milesToNextGas(map, site.mile)
  const nextIsGas = sortedSites(map).some((s) => s.mile > site.mile && isGasSite(s))
  return nextIsGas
    ? `⛽ ${pct(gallons, state.tankGallons)}% · last gas for ${milesLabel(after)}`
    : `⛽ ${pct(gallons, state.tankGallons)}% · last gas before the end`
}

function revealEvents(
  state: TripState,
  map: TripMap,
  siteIds: string[],
  mile: number,
): { state: TripState; log: TripLogEvent[]; effects: TripEffect[] } {
  let next = state
  const log: TripLogEvent[] = []
  const effects: TripEffect[] = []
  for (const siteId of siteIds) {
    const site = findSite(map, siteId)
    const runtime = next.sites[siteId]
    if (!site || !runtime || runtime.revealed) continue
    next = withSite(next, siteId, { revealed: true })
    log.push({ kind: "site", siteId, name: site.name, phase: "revealed" })
    const settings = resolveSiteSettings(map, site)
    if (settings.optional && !settings.mystery && site.mile > mile) {
      effects.push({
        type: "sign",
        variant: "info",
        icon: site.icon,
        title: `Coming up: ${site.name}`,
        body: `${milesLabel(site.mile - mile)} · ${site.description}`,
      })
    }
  }
  return { state: next, log, effects }
}

// ---------------------------------------------------------------------------
// Departure and lifecycle
// ---------------------------------------------------------------------------

export const depart: Transition = (state, { now, map }) => {
  if (state.status !== "loaded") return null
  const deadline = map.route.deadlineAt ? Date.parse(map.route.deadlineAt) : undefined
  let next: TripState = {
    ...state,
    status: "driving",
    departedAt: now,
    // Drive time plus the stops expected if nobody votes, so a fresh trip reads "On target".
    targetArrivalAt: deadline ?? now + map.route.driveMinutes * 60_000 + parkPlan(map).expectedMs,
    blockers: state.blockers.filter((b) => b.kind !== "admin-pause"),
  }
  const startReveals = map.sites
    .filter((site) => {
      const { revealMiles } = resolveSiteSettings(map, site)
      return revealMiles > 0 && site.mile - revealMiles <= 0
    })
    .map((site) => site.id)
  const revealed = revealEvents(next, map, startReveals, 0)
  next = revealed.state
  const first = nextSiteAhead(next, map, 0)
  const firstRuntime = first ? next.sites[first.id] : undefined
  return {
    next,
    log: [{ kind: "departed" }, ...revealed.log],
    effects: [
      {
        type: "sign",
        variant: "info",
        icon: "🚐",
        title: `On the road · ${map.title}`,
        body:
          first && firstRuntime?.revealed
            ? `Next: ${first.name}, ${milesLabel(first.mile)}`
            : `${milesLabel(state.routeMiles)} to go.`,
      },
      ...revealed.effects,
    ],
  }
}

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
    effects: [{ type: "sign", variant: "info", icon: "🚐", title: "Back on the road" }],
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
    effects:
      state.status === "driving"
        ? [{ type: "sign", variant: "info", icon: "🚐", title: "Back on the road" }]
        : [],
  }
}

/** Close polls, shops, pools, and incidents when the trip stops for good. */
function closeOpenWork(state: TripState): { effects: TripEffect[]; next: TripState } {
  const effects: TripEffect[] = []
  const sites = { ...state.sites }
  for (const [siteId, runtime] of Object.entries(state.sites)) {
    if (runtime.phase === "polling" && runtime.pollId) {
      effects.push({ type: "close-poll", pollId: runtime.pollId })
      sites[siteId] = { ...runtime, phase: "ahead", pollId: undefined, pollOptionIds: undefined }
    }
    if (runtime.phase === "parked") {
      sites[siteId] = { ...runtime, phase: "visited" }
    }
  }
  if (state.shopScopeId) effects.push({ type: "close-shop", scopeId: state.shopScopeId })
  if (state.fund?.mode === "voluntary") effects.push({ type: "close-pool", fundId: state.fund.id })
  return {
    effects,
    next: {
      ...state,
      sites,
      blockers: [],
      speedFactors: [],
      shopScopeId: undefined,
      fund: undefined,
      incident: undefined,
      incidentQueue: [],
    },
  }
}

export const endTrip: Transition = (state, { now }) => {
  if (state.status === "loaded" || state.status === "ended" || state.status === "stranded")
    return null
  const stranded = state.status === "driving"
  const { effects, next } = closeOpenWork(state)
  return {
    next: { ...next, status: stranded ? "stranded" : "ended", endedAt: now },
    log: [{ kind: stranded ? "stranded" : "ended" }],
    effects: [
      ...effects,
      stranded
        ? {
            type: "sign",
            variant: "warning",
            icon: "🛑",
            title: "Trip ended",
            body: "The van never made it. Maybe next time.",
          }
        : { type: "sign", variant: "info", icon: "🏁", title: "Trip complete" },
    ],
  }
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export function revealSite(siteId: string): Transition {
  return (state, { map, mile }) => {
    if (state.status !== "driving") return null
    const runtime = state.sites[siteId]
    if (!runtime || runtime.revealed) return null
    const result = revealEvents(state, map, [siteId], mile)
    return { next: result.state, log: result.log, effects: result.effects }
  }
}

export function markPolling(
  siteId: string,
  pollId: string,
  optionIds: [string, string],
): Transition {
  return (state, { map }) => {
    if (state.status !== "driving") return null
    const site = findSite(map, siteId)
    const runtime = state.sites[siteId]
    if (!site || runtime?.phase !== "ahead") return null
    let next = withSite(state, siteId, {
      phase: "polling",
      pollId,
      pollOptionIds: optionIds,
      pollRetryAt: undefined,
    })
    const log: TripLogEvent[] = []
    if (!resolveSiteSettings(map, site).mystery && !runtime.revealed) {
      next = withSite(next, siteId, { revealed: true })
      log.push({ kind: "site", siteId, name: site.name, phase: "revealed" })
    }
    log.push({ kind: "site", siteId, name: site.name, phase: "poll" })
    return { next, log }
  }
}

export function deferPoll(siteId: string, retryAt: number): Transition {
  return (state) => {
    const runtime = state.sites[siteId]
    if (state.status !== "driving" || runtime?.phase !== "ahead") return null
    return { next: withSite(state, siteId, { pollRetryAt: retryAt }) }
  }
}

export type SkipDecisionInput = {
  /** Vote counts, when a poll ran. Undefined = no poll (apply default). */
  votes?: SkipVotes
  /** Only resolve if the site's open poll is this one (POLL_CLOSED path). */
  pollId?: string
  /** Close the open poll as part of this decision (arrival path). */
  closePoll?: boolean
}

function decide(
  votes: SkipVotes | undefined,
  fallback: "stop" | "skip",
): { decision: "stop" | "skip"; defaulted: boolean } {
  if (!votes || votes.stop === votes.skip) return { decision: fallback, defaulted: true }
  return { decision: votes.stop > votes.skip ? "stop" : "skip", defaulted: false }
}

function applyDecision(
  state: TripState,
  ctx: TransitionContext,
  site: TripSite,
  input: SkipDecisionInput,
): TransitionResult {
  const { map } = ctx
  const runtime = state.sites[site.id]!
  const { decision, defaulted } = decide(input.votes, liveSkipDefault(state, map, site, ctx))
  const effects: TripEffect[] = []
  if (input.closePoll && runtime.phase === "polling" && runtime.pollId) {
    effects.push({ type: "close-poll", pollId: runtime.pollId })
  }
  const patch: Partial<SiteRuntime> = {
    phase: decision === "stop" ? "stopping" : "skipped",
    pollId: undefined,
    pollOptionIds: undefined,
    pollRetryAt: undefined,
    defaulted,
  }
  if (input.votes) patch.votes = input.votes
  const next = withSite(state, site.id, patch)
  const log: TripLogEvent[] = []
  if (decision === "skip") {
    log.push({
      kind: "site",
      siteId: site.id,
      name: site.name,
      phase: "skipped",
      ...(input.votes ? { votes: input.votes } : {}),
      defaulted,
    })
    const anyVotes = input.votes && input.votes.stop + input.votes.skip > 0
    if (anyVotes) {
      const mystery = resolveSiteSettings(map, site).mystery
      effects.push({
        type: "sign",
        variant: "info",
        icon: "⬆",
        title: mystery ? "Kept driving" : `Kept driving past ${site.name}`,
        body: defaulted
          ? `Tied ${input.votes!.stop}–${input.votes!.skip}. The van stays on the highway.`
          : `The room voted ${input.votes!.skip}–${input.votes!.stop} to keep going.`,
      })
    }
  }
  return { next, log, effects }
}

/** Resolve an optional site's skip decision (poll closed, or no poll could run). */
export function resolveSkip(siteId: string, input: SkipDecisionInput = {}): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const site = findSite(ctx.map, siteId)
    const runtime = state.sites[siteId]
    if (!site || !runtime) return null
    if (runtime.phase !== "ahead" && runtime.phase !== "polling") return null
    if (input.pollId !== undefined && runtime.pollId !== input.pollId) return null
    return applyDecision(state, ctx, site, input)
  }
}

export type ArrivalOptions = {
  votes?: SkipVotes
}

/** Open a gas fund step when the van parks at a gas site with room in the tank (M2). */
function openGasFund(
  state: TripState,
  ctx: TransitionContext,
  site: TripSite,
): { fund: TripFund; blocker: Blocker; effect: TripEffect; summary: string } | null {
  const price = site.services?.gas?.pricePerGallon
  if (price === undefined || isDestination(site)) return null
  const tank = Math.max(0, gallonsLeft(state, ctx.gallonsUsed))
  const gallons = Math.max(0, state.tankGallons - tank)
  const cost = gasCost(gallons, price, ctx.costScale)
  if (cost <= 0) return null
  const mode = state.fundsMode
  const holdMs =
    mode === "automatic" ? AUTOMATIC_FUND_HOLD_MS : ctx.map.tuning.funds.windowMinutes * 60_000
  const id = `fund:${state.tripId}:${site.id}:${ctx.now}`
  const fund: TripFund = {
    id,
    purpose: "gas",
    mode,
    siteId: site.id,
    cost,
    gallons,
    openedAt: ctx.now,
    endsAt: ctx.now + holdMs,
  }
  const gal = Math.round(gallons * 10) / 10
  return {
    fund,
    blocker: {
      id: `fund:${site.id}`,
      kind: "fund",
      since: ctx.now,
      until: fund.endsAt,
      siteId: site.id,
    },
    effect: { type: "open-fund", fund, title: `Gas at ${site.name}` },
    summary:
      mode === "automatic"
        ? `Pumping ${gal} gal: ${cost} coins.`
        : `${gal} gal for ${cost} coins. Chip in!`,
  }
}

function park(state: TripState, ctx: TransitionContext, site: TripSite): TransitionResult {
  const { map, now } = ctx
  const runtime = state.sites[site.id]!
  const settings = resolveSiteSettings(map, site)
  const until = now + settings.parkMs
  const blocker: Blocker = {
    id: `park:${site.id}`,
    kind: "parked",
    since: now,
    until,
    siteId: site.id,
  }
  const shop = openShopAt(state, site)
  const effects: TripEffect[] = [...shop.effects]
  const gas = state.fund ? null : openGasFund(state, ctx, site)
  const minutes = Math.round(settings.parkMs / 60_000)
  effects.push({
    type: "sign",
    variant: gas ? "success" : "info",
    icon: site.icon,
    title: exitTitle(site),
    body: gas
      ? `Parked for ${minutes} min. ${gas.summary}`
      : shop.scopeId
        ? `Parked for ${minutes} min. ${site.shop?.title ?? site.name} is open.`
        : `Parked for ${minutes} min. ${site.description}`,
  })
  if (gas) effects.push(gas.effect)
  const blockers = [...state.blockers.filter((b) => b.kind !== "parked"), blocker]
  if (gas) blockers.push(gas.blocker)
  const next: TripState = {
    ...withSite(state, site.id, {
      phase: "parked",
      revealed: true,
      visitedAt: now,
    }),
    blockers,
    shopScopeId: shop.scopeId,
    ...(gas ? { fund: gas.fund } : {}),
  }
  const log: TripLogEvent[] = []
  if (!runtime.revealed)
    log.push({ kind: "site", siteId: site.id, name: site.name, phase: "revealed" })
  log.push({
    kind: "site",
    siteId: site.id,
    name: site.name,
    phase: "stopped",
    ...(runtime.votes ? { votes: runtime.votes } : {}),
    ...(runtime.defaulted !== undefined ? { defaulted: runtime.defaulted } : {}),
  })
  return { next, log, effects }
}

function arriveDestination(
  state: TripState,
  map: TripMap,
  site: TripSite,
  now: number,
): TransitionResult {
  const deadline = map.route.deadlineAt
  const late = deadline !== undefined && now > Date.parse(deadline)
  const closed = closeOpenWork(state)
  const runtime = closed.next.sites[site.id]!
  const sites = {
    ...closed.next.sites,
    [site.id]: { ...runtime, phase: "visited" as const, revealed: true, visitedAt: now },
  }
  const log: TripLogEvent[] = []
  if (!runtime.revealed)
    log.push({ kind: "site", siteId: site.id, name: site.name, phase: "revealed" })
  log.push(late ? { kind: "late", deadlineAt: deadline } : { kind: "arrived" })
  return {
    next: { ...closed.next, status: late ? "late" : "arrived", arrivedAt: now, sites },
    log,
    effects: [
      ...closed.effects,
      {
        type: "sign",
        variant: late ? "warning" : "info",
        icon: site.icon,
        title: late ? `Made it to ${site.name} · late` : `Made it to ${site.name}`,
        body: site.description,
      },
      { type: "nudge-host" },
    ],
  }
}

/** The van reached a site's mile. Resolves an undecided skip first, then parks or drives past. */
export function arriveAtSite(siteId: string, input: ArrivalOptions = {}): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const site = findSite(ctx.map, siteId)
    const runtime = state.sites[siteId]
    if (!site || !runtime) return null
    if (ctx.mile < site.mile - ARRIVAL_MILE_EPSILON) return null
    // Already parked at another site: this arrival waits. The van is stopped,
    // so the threshold re-arms when the park ends and the site is reached then.
    if (state.blockers.some((b) => b.kind === "parked" && b.siteId !== siteId)) return null
    // A tow carries the van past sites; the tow's own arrival handles the Mechanic.
    if (state.incident?.steps[state.incident.step]?.kind === "tow") return null
    if (isDestination(site)) return arriveDestination(state, ctx.map, site, ctx.now)

    if (runtime.phase === "ahead" || runtime.phase === "polling") {
      const decided = applyDecision(state, ctx, site, { votes: input.votes, closePoll: true })
      if (decided.next.sites[siteId]?.phase !== "stopping") return decided
      const parked = park(decided.next, ctx, site)
      return {
        next: parked.next,
        log: [...(decided.log ?? []), ...(parked.log ?? [])],
        effects: [...(decided.effects ?? []), ...(parked.effects ?? [])],
      }
    }
    if (runtime.phase === "stopping") return park(state, ctx, site)
    return null
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
    const next: TripState = {
      ...withSite(state, site.id, { phase: "visited" }),
      blockers: state.blockers.filter((b) => b.id !== blocker.id),
      shopScopeId: undefined,
    }
    const log: TripLogEvent[] = [
      { kind: "site", siteId: site.id, name: site.name, phase: "departed" },
    ]
    const queued = startQueuedIncident(next, ctx)
    if (queued) {
      return {
        next: queued.next,
        log: [...log, ...(queued.log ?? [])],
        effects: [...effects, ...(queued.effects ?? [])],
      }
    }
    // A gas fund still holding the van announces the departure when it resolves.
    if (state.status === "driving" && !next.fund) effects.push(backOnTheRoad(next, ctx.map, site.mile))
    return { next, log, effects }
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
    let next: TripState = {
      ...state,
      fund: undefined,
      blockers: state.blockers.filter((b) => b.kind !== "fund"),
      lastFill: { gallons: state.tankGallons, gallonsUsed: ctx.gallonsUsed },
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
        effects.push(backOnTheRoad(next, ctx.map, site.mile))
      }
    }
    return { next, log, effects }
  }
}

/** Line the tank level crosses for a fuel threshold, in gallons. */
export function fuelLine(state: TripState, map: TripMap, level: FuelLevel): number {
  return level === "low" ? map.tuning.lowFuelPct * state.tankGallons : 0
}

/** Gas fell to `level` (M2). Empty starts Out of Gas (M4). */
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
      const started = startOrQueueIncident(next, ctx, { incident: "out-of-gas", source: "fuel" })
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
