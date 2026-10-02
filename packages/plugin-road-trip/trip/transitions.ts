import type { TripMap, TripSite } from "@repo/road-trip-map"
import { isDestination, parkPlan, resolveSiteSettings, sortedSites } from "@repo/road-trip-map"
import type { Blocker, SiteRuntime, SkipVotes, TripLogEvent, TripState } from "./state"

/**
 * Pure trip transitions (ADR 0200). `mutateTrip` runs them inside a CAS, so
 * they must not touch I/O and may run more than once. Side effects are
 * returned as intents and executed once after the write succeeds.
 */

export type SignVariant = "info" | "warning"

export type TripEffect =
  | { type: "sign"; variant: SignVariant; title: string; body?: string; icon?: string }
  | { type: "open-shop"; siteId: string; scopeId: string }
  | { type: "close-shop"; scopeId: string }
  | { type: "close-poll"; pollId: string }
  | { type: "nudge-host" }

export type TransitionContext = {
  now: number
  /** Van mile at `now`, projected from the current leg. */
  mile: number
  map: TripMap
}

export type TransitionResult = {
  next: TripState
  log?: TripLogEvent[]
  effects?: TripEffect[]
}

export type Transition = (state: TripState, ctx: TransitionContext) => TransitionResult | null

/** Arrival handlers tolerate float drift between the solved time and the projected mile. */
export const ARRIVAL_MILE_EPSILON = 0.02

function findSite(map: TripMap, siteId: string): TripSite | undefined {
  return map.sites.find((site) => site.id === siteId)
}

function withSite(state: TripState, siteId: string, patch: Partial<SiteRuntime>): TripState {
  const current = state.sites[siteId]
  if (!current) return state
  return { ...state, sites: { ...state.sites, [siteId]: { ...current, ...patch } } }
}

export function siteShopScopeId(tripId: string, siteId: string): string {
  return `trip:${tripId}:site:${siteId}`
}

function exitTitle(site: TripSite): string {
  return `EXIT ${Math.round(site.mile)} · ${site.name.toUpperCase()}`
}

function milesLabel(miles: number): string {
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles)
  return `${rounded} mi`
}

/** Next site ahead of `mile` that the van will still reach (not skipped / visited). */
export function nextSiteAhead(state: TripState, map: TripMap, mile: number): TripSite | undefined {
  return sortedSites(map).find((site) => {
    const runtime = state.sites[site.id]
    if (!runtime) return false
    if (runtime.phase === "skipped" || runtime.phase === "visited" || runtime.phase === "parked") {
      return false
    }
    return site.mile > mile - ARRIVAL_MILE_EPSILON
  })
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

function closeOpenWork(state: TripState): { effects: TripEffect[]; sites: TripState["sites"] } {
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
  return { effects, sites }
}

export const endTrip: Transition = (state, { now }) => {
  if (state.status === "loaded" || state.status === "ended" || state.status === "stranded")
    return null
  const stranded = state.status === "driving"
  const { effects, sites } = closeOpenWork(state)
  return {
    next: {
      ...state,
      status: stranded ? "stranded" : "ended",
      endedAt: now,
      blockers: [],
      sites,
      shopScopeId: undefined,
    },
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
  map: TripMap,
  site: TripSite,
  input: SkipDecisionInput,
): TransitionResult {
  const runtime = state.sites[site.id]!
  const { decision, defaulted } = decide(input.votes, resolveSiteSettings(map, site).skipDefault)
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
  return (state, { map }) => {
    if (state.status !== "driving") return null
    const site = findSite(map, siteId)
    const runtime = state.sites[siteId]
    if (!site || !runtime) return null
    if (runtime.phase !== "ahead" && runtime.phase !== "polling") return null
    if (input.pollId !== undefined && runtime.pollId !== input.pollId) return null
    return applyDecision(state, map, site, input)
  }
}

function park(state: TripState, map: TripMap, site: TripSite, now: number): TransitionResult {
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
  const effects: TripEffect[] = []
  const shopIds = site.shop?.shopIds ?? []
  const scopeId = shopIds.length > 0 ? siteShopScopeId(state.tripId, site.id) : undefined
  if (state.shopScopeId && state.shopScopeId !== scopeId) {
    effects.push({ type: "close-shop", scopeId: state.shopScopeId })
  }
  if (scopeId) effects.push({ type: "open-shop", siteId: site.id, scopeId })
  const minutes = Math.round(settings.parkMs / 60_000)
  effects.push({
    type: "sign",
    variant: "info",
    icon: site.icon,
    title: exitTitle(site),
    body: scopeId
      ? `Parked for ${minutes} min. ${site.shop?.title ?? site.name} is open.`
      : `Parked for ${minutes} min. ${site.description}`,
  })
  const next: TripState = {
    ...withSite(state, site.id, {
      phase: "parked",
      revealed: true,
      visitedAt: now,
    }),
    blockers: [...state.blockers.filter((b) => b.kind !== "parked"), blocker],
    shopScopeId: scopeId,
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
  const { effects, sites } = closeOpenWork(state)
  const runtime = sites[site.id]!
  sites[site.id] = { ...runtime, phase: "visited", revealed: true, visitedAt: now }
  const log: TripLogEvent[] = []
  if (!runtime.revealed)
    log.push({ kind: "site", siteId: site.id, name: site.name, phase: "revealed" })
  log.push(late ? { kind: "late", deadlineAt: deadline } : { kind: "arrived" })
  return {
    next: {
      ...state,
      status: late ? "late" : "arrived",
      arrivedAt: now,
      blockers: [],
      sites,
      shopScopeId: undefined,
    },
    log,
    effects: [
      ...effects,
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
export function arriveAtSite(siteId: string, input: { votes?: SkipVotes } = {}): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const site = findSite(ctx.map, siteId)
    const runtime = state.sites[siteId]
    if (!site || !runtime) return null
    if (ctx.mile < site.mile - ARRIVAL_MILE_EPSILON) return null
    // Already parked at another site: this arrival waits. The van is stopped,
    // so the threshold re-arms when the park ends and the site is reached then.
    if (state.blockers.some((b) => b.kind === "parked" && b.siteId !== siteId)) return null
    if (isDestination(site)) return arriveDestination(state, ctx.map, site, ctx.now)

    if (runtime.phase === "ahead" || runtime.phase === "polling") {
      const decided = applyDecision(state, ctx.map, site, { votes: input.votes, closePoll: true })
      if (decided.next.sites[siteId]?.phase !== "stopping") return decided
      const parked = park(decided.next, ctx.map, site, ctx.now)
      return {
        next: parked.next,
        log: [...(decided.log ?? []), ...(parked.log ?? [])],
        effects: [...(decided.effects ?? []), ...(parked.effects ?? [])],
      }
    }
    if (runtime.phase === "stopping") return park(state, ctx.map, site, ctx.now)
    return null
  }
}

/** End a parked stop: blocker off, shop closed, site visited. */
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
    if (state.status === "driving") {
      const upcoming = nextSiteAhead(next, ctx.map, site.mile + ARRIVAL_MILE_EPSILON)
      const upcomingRuntime = upcoming ? next.sites[upcoming.id] : undefined
      effects.push({
        type: "sign",
        variant: "info",
        icon: "🚐",
        title: "Back on the road",
        body:
          upcoming && upcomingRuntime?.revealed
            ? `Next: ${upcoming.name}, ${milesLabel(upcoming.mile - site.mile)}`
            : undefined,
      })
    }
    return {
      next,
      log: [{ kind: "site", siteId: site.id, name: site.name, phase: "departed" }],
      effects,
    }
  }
}

/** Expire a timed blocker (only parking has an expiry in Phase 1). */
export function expireBlocker(blockerId: string): Transition {
  return (state, ctx) => {
    const blocker = state.blockers.find((b) => b.id === blockerId)
    if (!blocker || blocker.until === undefined || blocker.until > ctx.now) return null
    if (blocker.kind === "parked") return finishPark(blocker.siteId)(state, ctx)
    return { next: { ...state, blockers: state.blockers.filter((b) => b.id !== blockerId) } }
  }
}
