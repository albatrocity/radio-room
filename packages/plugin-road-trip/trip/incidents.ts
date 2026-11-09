import type {
  IncidentStep,
  IncidentStepContext,
  NarrativeVariant,
  TripEvent,
  TriggerableIncidentId,
} from "@repo/road-trip-map"
import {
  bookAt,
  bookCreditLine,
  builtInEvent,
  compileEventSteps,
  knowledgeCredit,
  eventChoice,
  eventRefuels,
  FUND_PURPOSE_LABELS,
  fuelEvent,
  immunePart,
  isDestination,
  mileEvents,
  nearestMechanicAhead,
  roadTripItemId,
  siteShopTitle,
  sortedSites,
  TRIGGERABLE_INCIDENT_IDS,
  vanConsumable,
  vanPart,
} from "@repo/road-trip-map"
import { flow, refresh, type Emit, type FlowHandler } from "./flow"
import {
  ARRIVAL_MILE_EPSILON,
  AUTOMATIC_FUND_HOLD_MS,
  BACK_ON_THE_ROAD,
  findSite,
  fundShareCopy,
  milesLabel,
  openShopAt,
  narrate,
  seededIndex,
  type Transition,
  type TransitionContext,
  type TransitionResult,
  type TripEffect,
} from "./helpers"
import {
  gallonsLeft,
  installedPartIds,
  liveBlockers,
  readersAt,
  refillShownAfterFill,
  vanKnowledge,
  type ActiveIncident,
  type Blocker,
  type FundPayment,
  type IncidentSnapshot,
  type IncidentSource,
  type QueuedIncident,
  type TripFund,
  type TripLogEvent,
  type TripState,
} from "./state"

/**
 * The incident engine (M4): one incident at a time, one step at a time,
 * every step ending on its own (D22). Incidents start from trip events
 * compiled by `compileEventSteps` (ADR 0220). Pure, like `./transitions`.
 * Sites, junctions, layers, and votes change only through the trip flow
 * (ADR 0222): this module returns flow events for them, never writes them.
 */

/** A choice step's backstop: this long after its poll should have closed, the default applies. */
export const CHOICE_GRACE_MS = 5_000

type Acc = { next: TripState; log: TripLogEvent[]; effects: TripEffect[] }

type Traveler = { userId: string; name: string }

type IncidentLogEvent = TripLogEvent & { kind: "incident" }

/** The event a queued incident runs: hosts fire built-in presets, maps their own events. */
function eventFor(ctx: TransitionContext, queued: QueuedIncident): TripEvent | undefined {
  switch (queued.source) {
    case "host":
      return (TRIGGERABLE_INCIDENT_IDS as readonly string[]).includes(queued.incident)
        ? builtInEvent(queued.incident as TriggerableIncidentId)
        : undefined
    case "scripted":
      return ctx.map.events?.find((e) => e.id === (queued.eventId ?? queued.incident))
    case "fuel":
      return fuelEvent(ctx.map)
  }
}

function snapshotOf(event: TripEvent): IncidentSnapshot {
  const cleared = event.clearedNarrative?.trim()
  return {
    name: event.name,
    icon: event.icon,
    family: event.family ?? "none",
    refuels: eventRefuels(event),
    ...(cleared ? { clearedNarrative: cleared } : {}),
  }
}

/** A log line for an incident step, carrying the event's name and icon. */
function incidentEntry(
  incident: { incident: string; source: IncidentSource; name: string; icon: string },
  step: IncidentLogEvent["step"],
  extra: Partial<IncidentLogEvent> = {},
): IncidentLogEvent {
  return {
    kind: "incident",
    incident: incident.incident,
    name: incident.name,
    icon: incident.icon,
    source: incident.source,
    step,
    ...extra,
  }
}

function prose(body: string | undefined, variant?: NarrativeVariant): TripEffect | null {
  const text = body?.trim()
  if (!text) return null
  return { type: "narrate", body: text, ...(variant ? { variant } : {}) }
}

/** Start a map event's timed narratives; `incidentId` drops them when that incident clears. */
function startBeats(state: TripState, event: TripEvent, now: number, incidentId?: string): TripState {
  if (!event.beats?.length || state.beatRuns.some((run) => run.eventId === event.id)) return state
  return {
    ...state,
    beatRuns: [
      ...state.beatRuns,
      { eventId: event.id, startedAt: now, fired: [], ...(incidentId ? { incidentId } : {}) },
    ],
  }
}

function holdId(incident: ActiveIncident): string {
  return `incident:${incident.id}`
}

/** Drop the incident's blocker and speed factor. */
function release(state: TripState, incident: ActiveIncident): TripState {
  const id = holdId(incident)
  return {
    ...state,
    blockers: state.blockers.filter((b) => b.id !== id),
    speedFactors: state.speedFactors.filter((f) => f.id !== id),
  }
}

/** Stop the van for the incident (no expiry: the incident threshold moves it on). */
function hold(state: TripState, incident: ActiveIncident, now: number): TripState {
  const id = holdId(incident)
  if (state.blockers.some((b) => b.id === id)) return state
  const blocker: Blocker = { id, kind: "incident", since: now }
  return { ...state, blockers: [...state.blockers, blocker] }
}

/** Parked at a site or paying for gas: incidents wait for the van to leave (M4). */
function isStopped(state: TripState): boolean {
  return state.fund !== undefined || state.blockers.some((b) => b.kind === "parked")
}

function result(acc: Acc): TransitionResult {
  return { next: acc.next, log: acc.log, effects: acc.effects }
}

function itemNames(shortIds: readonly string[]): string {
  return shortIds.map((id) => vanConsumable(id)?.name ?? id).join(" or ")
}

/** Start now, or queue behind the incident or stop in progress. An empty tank cuts a slowdown short. */
export function startOrQueueIncident(
  state: TripState,
  ctx: TransitionContext,
  queued: QueuedIncident,
): TransitionResult {
  if (state.status !== "driving") return { next: state }
  let acc: Acc = { next: state, log: [], effects: [] }
  const active = state.incident
  if (active && queued.source === "fuel" && active.steps[active.step]?.kind === "slow") {
    acc = finishIncident(acc, ctx, active, { quiet: true, startQueue: false })
  } else if (active || isStopped(state)) {
    if (queued.eventId && state.incidentQueue.some((q) => q.eventId === queued.eventId)) {
      return { next: state }
    }
    return { next: { ...state, incidentQueue: [...state.incidentQueue, queued] } }
  }
  return result(beginIncident(acc, ctx, queued))
}

/** Start the next queued incident once nothing else holds the van; null when none can start. */
export function startQueuedIncident(
  state: TripState,
  ctx: TransitionContext,
): TransitionResult | null {
  if (state.status !== "driving" || state.incident || isStopped(state)) return null
  const [head, ...rest] = state.incidentQueue
  if (!head) return null
  return result(
    beginIncident({ next: { ...state, incidentQueue: rest }, log: [], effects: [] }, ctx, head),
  )
}

/** Then start whatever was queued behind it. */
function thenStartQueued(acc: Acc, ctx: TransitionContext): Acc {
  const queuedNext = startQueuedIncident(acc.next, ctx)
  return queuedNext
    ? {
        next: queuedNext.next,
        log: [...acc.log, ...(queuedNext.log ?? [])],
        effects: [...acc.effects, ...(queuedNext.effects ?? [])],
      }
    : acc
}

/** Apply an event's start outcomes (ADR 0222) before anything is compiled from the path. */
function applyStartOutcomes(acc: Acc, ctx: TransitionContext, event: TripEvent): Acc {
  if (!event.outcomes?.length) return acc
  return flow(acc, ctx, {
    type: "APPLY_OUTCOMES",
    outcomes: event.outcomes,
    source: { kind: "event", id: event.id },
  })
}

/**
 * Before a tow picks its Mechanic, settle each fork ahead until a Mechanic
 * lies before the next one: an open vote resolves from its tally, an unpolled
 * fork is passed, a decided fork is honored (ADR 0222).
 */
function settleForksForTow(acc: Acc, ctx: TransitionContext): Acc {
  let next = acc
  for (let guard = 0; guard < 16; guard++) {
    const live = refresh(ctx, next.next)
    const fork = live.path.forks.find(
      (f) => f.decision === undefined && f.odometer >= ctx.mile - ARRIVAL_MILE_EPSILON,
    )
    if (!fork) return next
    const mechanic = nearestMechanicAhead(live.map, ctx.mile)
    if (mechanic && mechanic.mile <= fork.odometer) return next
    const settled = flow(next, live, { type: "JUNCTION_TOW_SETTLE", routeId: fork.routeId })
    if (settled.next === next.next) return next
    next = settled
  }
  return next
}

function beginIncident(acc: Acc, rawCtx: TransitionContext, queued: QueuedIncident): Acc {
  const event = eventFor(rawCtx, queued)
  if (!event) return thenStartQueued(acc, rawCtx)
  acc = applyStartOutcomes(acc, rawCtx, event)
  if ((event.resolution ?? []).some((entry) => entry.kind === "tow") && event.effect?.kind === "stop") {
    acc = settleForksForTow(acc, refresh(rawCtx, acc.next))
  }
  const ctx = refresh(rawCtx, acc.next)
  const state = acc.next
  const snapshot = snapshotOf(event)
  const named = { incident: event.id, source: queued.source, ...snapshot }
  const seq = state.incidentSeq + 1
  const parts = installedPartIds(state)
  const stepCtx = { mile: ctx.mile, parts, knowledge: vanKnowledge(state) }
  const steps = compileEventSteps(ctx.map, event, stepCtx)
  if (steps.length === 0) {
    const part = event.effect ? immunePart(parts, snapshot.family) : undefined
    if (!part) return thenStartQueued(noteEvent(acc, ctx, event, queued.source, true), ctx)
    const copy = part.immuneCopy ?? {
      title: `${part.name} to the rescue`,
      body: `${snapshot.name}? Not with the ${part.name}.`,
    }
    return thenStartQueued(
      {
        next: { ...state, incidentSeq: seq },
        log: [...acc.log, incidentEntry(named, "immune", { partId: part.shortId })],
        effects: [
          ...acc.effects,
          { type: "sign", variant: "success", icon: part.emoji, ...copy },
        ],
      },
      ctx,
    )
  }
  const incident: ActiveIncident = {
    id: `incident-${seq}`,
    ...named,
    steps,
    step: 0,
    stepStartedAt: ctx.now,
  }
  const started: Acc = {
    next: startBeats({ ...state, incidentSeq: seq, incident }, event, ctx.now, incident.id),
    log: [...acc.log, incidentEntry(named, "started")],
    effects: [],
  }
  const entered = enterStep(started, ctx, incident, 0, { announceFund: false })
  const first = steps[0]!
  const fund = entered.next.fund?.incidentId === incident.id ? entered.next.fund : undefined
  const body = [bookCredit(state, ctx, event, stepCtx), startHint(first, fund)]
    .filter(Boolean)
    .join(" ")
  const sign: TripEffect = {
    type: "sign",
    variant:
      first.kind === "slow" ? "warning" : first.kind === "choice" && !first.holds ? "info" : "error",
    icon: snapshot.icon,
    title: snapshot.name,
    ...(body ? { body } : {}),
  }
  const narrative = prose(event.narrative, event.narrativeVariant)
  return {
    next: entered.next,
    log: entered.log,
    effects: [...acc.effects, sign, ...(narrative ? [narrative] : []), ...entered.effects],
  }
}

/** An event that doesn't hold the van: its outcomes, narrative, and beats only. */
function noteEvent(
  acc: Acc,
  ctx: TransitionContext,
  event: TripEvent,
  source: IncidentSource,
  outcomesApplied = false,
): Acc {
  if (!outcomesApplied) acc = applyStartOutcomes(acc, ctx, event)
  const narrative = prose(event.narrative, event.narrativeVariant)
  return {
    next: startBeats(acc.next, event, ctx.now),
    log: [
      ...acc.log,
      incidentEntry({ incident: event.id, source, name: event.name, icon: event.icon }, "noted"),
    ],
    effects: [...acc.effects, ...(narrative ? [narrative] : [])],
  }
}

/** "Doug read Defensive Driving, so the jam isn't quite so slow." when a van book changed the incident. */
function bookCredit(
  state: TripState,
  ctx: TransitionContext,
  event: TripEvent,
  stepCtx: IncidentStepContext,
): string {
  const series = knowledgeCredit(ctx.map, event, stepCtx)
  const level = series ? stepCtx.knowledge?.[series] : undefined
  const book = series && level ? bookAt(series, level) : undefined
  if (!series || !level || !book) return ""
  return bookCreditLine(book, readersAt(state, series, level))
}

function startHint(step: IncidentStep, fund: TripFund | undefined): string {
  switch (step.kind) {
    case "slow": {
      const items = step.resolvesWith ?? []
      const teaser = items.map((id) => vanConsumable(id)?.hint).find(Boolean)
      if (teaser) return teaser
      return items.length > 0 ? `Got a ${itemNames(items)}? Use it from the Van tab.` : ""
    }
    case "window":
      return `Got a ${itemNames(step.resolvesWith)}? Use it from the Van tab.`
    case "choice":
      return step.holds ? "The van waits while the room decides." : ""
    case "fund":
      return fund ? `${FUND_PURPOSE_LABELS[step.purpose]}: ${fund.cost} coins.` : ""
    default:
      return ""
  }
}

function enterStep(
  acc: Acc,
  ctx: TransitionContext,
  incident: ActiveIncident,
  index: number,
  options: { announceFund?: boolean } = {},
): Acc {
  if (index >= incident.steps.length) return finishIncident(acc, ctx, incident)
  const step = incident.steps[index]!
  const current: ActiveIncident = {
    ...incident,
    step: index,
    stepStartedAt: ctx.now,
    stepEndsAt: undefined,
  }
  let state = acc.next
  const effects: TripEffect[] = []
  delete current.choice
  const choice = step.kind === "choice" ? step.choice : step.kind === "slow" ? step.choice : undefined
  if (choice) {
    // The room votes now; `CHOICE_DECIDED` resolves it (ADR 0222).
    current.choice = { vote: { phase: "pending" } }
    effects.push({
      type: "open-vote",
      target: { kind: "choice", incidentId: incident.id, step: index },
    })
  }
  switch (step.kind) {
    case "choice":
      current.stepEndsAt = ctx.now + step.choice.ms + CHOICE_GRACE_MS
      if (step.holds) state = hold(state, incident, ctx.now)
      else state = release(state, incident)
      break
    case "slow": {
      const until = ctx.now + step.ms
      current.stepEndsAt = until
      const id = holdId(incident)
      state = {
        ...release(state, incident),
        speedFactors: [
          ...state.speedFactors.filter((f) => f.id !== id),
          { id, factor: step.factor, until, source: incident.incident, label: incident.name },
        ],
      }
      break
    }
    case "window":
      current.stepEndsAt = ctx.now + step.ms
      state = hold(state, incident, ctx.now)
      effects.push({
        type: "nudge-holders",
        itemIds: step.resolvesWith.map(roadTripItemId),
        message: `${incident.icon} ${incident.name}! You have a ${itemNames(step.resolvesWith)}: use it from the Van tab in the next ${Math.round(step.ms / 1000)}s.`,
      })
      break
    case "wait":
      current.stepEndsAt = ctx.now + step.ms
      state = hold(state, incident, ctx.now)
      break
    case "fund":
      return openIncidentFund(
        {
          next: { ...hold(state, incident, ctx.now), incident: current },
          log: acc.log,
          effects: acc.effects,
        },
        ctx,
        current,
        step,
        options.announceFund ?? true,
      )
    case "tow": {
      const site = findSite(ctx.map, step.siteId)
      if (!site) return enterStep(acc, ctx, incident, index + 1)
      current.towFromMile = ctx.mile
      const passed = towPast({ next: release(state, incident), log: [], effects: [] }, ctx, site.mile)
      state = passed.next
      acc = { ...acc, log: [...acc.log, ...passed.log] }
      effects.push(...passed.effects, {
        type: "sign",
        variant: "info",
        icon: "🚚",
        title: `Towing to ${site.name}`,
        body: `${milesLabel(Math.max(0, site.mile - ctx.mile))} on the hook.`,
      })
      break
    }
  }
  return {
    next: { ...state, incident: current },
    log: acc.log,
    effects: [...acc.effects, ...effects],
  }
}

/** Sites and mile events the tow passes are skipped (M4: tow legs); its Mechanic's poll closes. */
function towPast(acc: Acc, ctx: TransitionContext, targetMile: number): Acc {
  let next = acc
  for (const site of sortedSites(ctx.map)) {
    if (site.mile <= ctx.mile - ARRIVAL_MILE_EPSILON || site.mile > targetMile) continue
    if (isDestination(site)) continue
    next =
      site.mile >= targetMile
        ? flow(next, ctx, { type: "VOTE_CANCEL", target: { kind: "site", id: site.id } })
        : flow(next, ctx, { type: "SITE_TOW_PAST", siteId: site.id })
  }
  const passedEvents = mileEvents(ctx.map)
    .filter((e) => e.mile < targetMile && !next.next.scriptedFired.includes(e.id))
    .map((e) => e.id)
  if (passedEvents.length > 0) {
    next = {
      ...next,
      next: { ...next.next, scriptedFired: [...next.next.scriptedFired, ...passedEvents] },
    }
  }
  return next
}

/** At the tow's arrival: forks and rejoins it carried the van past, in order (ADR 0222). */
function passOnTheHook(acc: Acc, ctx: TransitionContext): Acc {
  let next = acc
  for (let guard = 0; guard < 16; guard++) {
    const live = refresh(ctx, next.next)
    const fork = live.path.forks.find((f) => f.odometer <= ctx.mile + ARRIVAL_MILE_EPSILON)
    const end = live.path.ends.find((e) => e.odometer <= ctx.mile + ARRIVAL_MILE_EPSILON)
    const first = fork && (!end || fork.odometer <= end.odometer) ? fork : undefined
    const moved = first
      ? flow(next, live, { type: "JUNCTION_REACH", routeId: first.routeId, towed: true })
      : end
        ? flow(next, live, { type: "ROUTE_END", routeId: end.routeId, towed: true })
        : next
    if (moved.next === next.next) return next
    next = moved
  }
  return next
}

function openIncidentFund(
  acc: Acc,
  ctx: TransitionContext,
  incident: ActiveIncident,
  step: Extract<IncidentStep, { kind: "fund" }>,
  announce: boolean,
): Acc {
  const state = acc.next
  const label = FUND_PURPOSE_LABELS[step.purpose]
  const card = state.parts.membership
  if (step.waivable && card && vanPart(card.partId)?.waivesNextFee) {
    const parts = { ...state.parts }
    delete parts.membership
    return enterStep(
      {
        next: { ...state, parts },
        log: [
          ...acc.log,
          incidentEntry(incident, "aaa", {
            resolvedBy: {
              userId: card.userId,
              name: card.name,
              itemId: roadTripItemId(card.partId),
            },
          }),
        ],
        effects: [
          ...acc.effects,
          {
            type: "sign",
            variant: "success",
            icon: "💳",
            title: `AAA covers the ${label.toLowerCase()}`,
            body: `${card.name}'s AAA card pays ${step.provider}. The card is spent.`,
          },
        ],
      },
      ctx,
      incident,
      incident.step + 1,
    )
  }
  const cost = Math.round(step.baseCost * ctx.costScale)
  if (cost <= 0) return enterStep(acc, ctx, incident, incident.step + 1)
  const mode = state.fundsMode
  const holdMs =
    mode === "automatic" ? AUTOMATIC_FUND_HOLD_MS : ctx.map.tuning.funds.windowMinutes * 60_000
  const gallons =
    step.purpose === "delivery"
      ? Math.max(0, state.tankGallons - Math.max(0, gallonsLeft(state, ctx.gallonsUsed)))
      : 0
  const fund: TripFund = {
    id: `fund:${state.tripId}:${incident.id}:${incident.step}`,
    purpose: step.purpose,
    mode,
    incidentId: incident.id,
    provider: step.provider,
    ...(incident.atSiteId ? { siteId: incident.atSiteId } : {}),
    cost,
    gallons,
    openedAt: ctx.now,
    endsAt: ctx.now + holdMs,
  }
  const blocker: Blocker = {
    id: `fund:${incident.id}`,
    kind: "fund",
    since: ctx.now,
    until: fund.endsAt,
    ...(incident.atSiteId ? { siteId: incident.atSiteId } : {}),
  }
  const effects: TripEffect[] = [
    ...acc.effects,
    { type: "open-fund", fund, title: `${label} · ${step.provider}` },
  ]
  if (announce) {
    effects.unshift({
      type: "sign",
      variant: "warning",
      icon: incident.icon,
      title: `${label}: ${cost} coins`,
      body: mode === "automatic" ? `Paying ${step.provider}.` : `Chip in for ${step.provider}!`,
    })
  }
  return {
    next: { ...state, fund, blockers: [...state.blockers, blocker] },
    log: acc.log,
    effects,
  }
}

const SHORT_INCIDENT_COPY: ((provider: string, collected: number, cost: number) => string)[] = [
  (provider, collected, cost) =>
    `${capitalize(provider)} counts ${collected} of ${cost} coins, sighs, and gets to work anyway.`,
  (provider, collected, cost) =>
    `${collected} of ${cost} coins. ${capitalize(provider)} shrugs and does the job.`,
  (provider, collected, cost) =>
    `Short by ${cost - collected} coins. ${capitalize(provider)} lets it slide.`,
]

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** An incident fund resolved (settled, short, or waived): log it and move to the next step. */
export function resolveIncidentFund(
  state: TripState,
  ctx: TransitionContext,
  fund: TripFund,
  outcome: {
    collected: number
    payers: number
    topContributors?: FundPayment[]
    paid?: FundPayment[]
    waived?: boolean
  },
): TransitionResult {
  const incident = state.incident
  const provider = fund.provider ?? "the mechanic"
  const label = FUND_PURPOSE_LABELS[fund.purpose]
  const collected = outcome.waived
    ? 0
    : Math.min(fund.cost, Math.max(0, Math.floor(outcome.collected)))
  const next: TripState = {
    ...state,
    fund: undefined,
    blockers: state.blockers.filter((b) => b.kind !== "fund"),
  }
  const log: TripLogEvent[] = [
    {
      kind: "fund",
      purpose: fund.purpose,
      mode: fund.mode,
      ...(fund.siteId ? { siteId: fund.siteId } : {}),
      name: provider,
      cost: fund.cost,
      collected,
      payers: outcome.waived ? 0 : outcome.payers,
      ...(incident ? { incident: incident.incident } : {}),
      ...(outcome.waived ? { waived: true } : {}),
      ...(!outcome.waived && outcome.topContributors?.length
        ? { topContributors: outcome.topContributors }
        : {}),
      ...(!outcome.waived && outcome.paid?.length ? { paid: outcome.paid } : {}),
    },
  ]
  const body = outcome.waived
    ? "The host waved it through. No charge."
    : collected < fund.cost
      ? SHORT_INCIDENT_COPY[seededIndex(state.seed, fund.id, SHORT_INCIDENT_COPY.length)]!(
          provider,
          collected,
          fund.cost,
        )
      : `${collected} coins${fundShareCopy(fund, collected, outcome.payers)}.`
  const effects: TripEffect[] = [
    {
      type: "sign",
      variant: "success",
      icon: "🧾",
      title: outcome.waived ? `${label} waived` : `${label} paid`,
      body,
    },
  ]
  if (!incident || incident.id !== fund.incidentId) return { next, log, effects }
  return result(enterStep({ next, log, effects }, ctx, incident, incident.step + 1))
}

function finishIncident(
  acc: Acc,
  ctx: TransitionContext,
  incident: ActiveIncident,
  options: { quiet?: boolean; startQueue?: boolean } = {},
): Acc {
  let state: TripState = {
    ...release(acc.next, incident),
    incident: undefined,
    beatRuns: acc.next.beatRuns.filter((run) => run.incidentId !== incident.id),
  }
  const log: TripLogEvent[] = [...acc.log]
  const effects: TripEffect[] = [...acc.effects]
  if (incident.refuels) {
    const preGallons = Math.max(0, gallonsLeft(state, ctx.gallonsUsed))
    const added = Math.max(0, state.tankGallons - preGallons)
    const shown = refillShownAfterFill({ ...state, incident }, preGallons, ctx.now)
    state = {
      ...state,
      lastFill: {
        gallons: state.tankGallons,
        gallonsUsed: ctx.gallonsUsed,
        ...(shown ? { shown } : {}),
      },
      fuelFlags: [],
    }
    log.push({ kind: "fuel", level: "filled", gallons: added })
  }
  if (incident.atSiteId) {
    const site = findSite(ctx.map, incident.atSiteId)
    if (state.shopScopeId) effects.push({ type: "close-shop", scopeId: state.shopScopeId })
    const left = flow({ next: state, log: [], effects: [] }, ctx, {
      type: "SITE_LEAVE",
      siteId: incident.atSiteId,
    })
    state = { ...left.next, shopScopeId: undefined }
    log.push(...left.log)
    effects.push(...left.effects)
    if (site) log.push({ kind: "site", siteId: site.id, name: site.name, phase: "departed" })
  }
  log.push(incidentEntry(incident, "cleared", incident.refuels ? { refueled: true } : {}))
  if (!options.quiet && state.status === "driving" && liveBlockers(state, ctx.now).length === 0) {
    effects.push(
      incident.clearedNarrative
        ? { ...BACK_ON_THE_ROAD, icon: incident.icon, body: incident.clearedNarrative }
        : BACK_ON_THE_ROAD,
    )
  }
  const done: Acc = { next: state, log, effects }
  if (options.startQueue === false) return done
  return thenStartQueued(done, ctx)
}

// ---------------------------------------------------------------------------
// Entry points (one per threshold, action, or item)
// ---------------------------------------------------------------------------

/** Host trigger from Quick Access (D23). Queues behind a running incident or a stop. */
export function triggerIncident(incident: TriggerableIncidentId): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const started = startOrQueueIncident(state, ctx, { incident, source: "host" })
    return started.next === state ? null : started
  }
}

/** A mile event was reached (D23). One with no effect (and no choice) only narrates; it never queues. */
export function fireScripted(eventId: string): Transition {
  return (state, ctx) => {
    if (state.status !== "driving" || state.scriptedFired.includes(eventId)) return null
    const event = mileEvents(ctx.map).find((e) => e.id === eventId)
    if (!event || ctx.mile < event.mile - ARRIVAL_MILE_EPSILON) return null
    const next = { ...state, scriptedFired: [...state.scriptedFired, eventId] }
    // Narrative-only events never queue; one with a choice holds the incident slot (ADR 0222).
    if (!event.effect && !eventChoice(event)) {
      return result(noteEvent({ next, log: [], effects: [] }, ctx, event, "scripted"))
    }
    return startOrQueueIncident(next, ctx, {
      incident: event.id,
      source: "scripted",
      eventId,
    })
  }
}

/** A map event's timed narrative came due. Idempotent on (event, beat). */
export function fireBeat(eventId: string, index: number): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const run = state.beatRuns.find((r) => r.eventId === eventId)
    const beats = ctx.map.events?.find((e) => e.id === eventId)?.beats ?? []
    const beat = beats[index]
    if (!run || !beat || run.fired.includes(index)) return null
    if (run.incidentId !== undefined && state.incident?.id !== run.incidentId) return null
    if (ctx.now < run.startedAt + beat.atMinutes * 60_000) return null
    const fired = [...run.fired, index]
    const others = state.beatRuns.filter((r) => r !== run)
    const narrative = prose(beat.narrative, beat.narrativeVariant)
    return {
      next: {
        ...state,
        beatRuns: fired.length >= beats.length ? others : [...others, { ...run, fired }],
      },
      effects: narrative ? [narrative] : [],
    }
  }
}

/** A timed step ran out, or the tow reached its Mechanic. Idempotent on (incident, step). */
export function advanceIncident(incidentId: string, step: number): Transition {
  return (state, ctx) => {
    const incident = state.incident
    if (!incident || incident.id !== incidentId || incident.step !== step) return null
    const current = incident.steps[step]
    if (!current) return null
    const acc: Acc = { next: state, log: [], effects: [] }
    if (current.kind === "tow") return towArrived(acc, ctx, incident, current.siteId)
    if (current.kind === "fund") return null
    if (incident.stepEndsAt === undefined || ctx.now < incident.stepEndsAt) return null
    const choice = current.kind === "choice" ? current.choice : current.kind === "slow" ? current.choice : undefined
    if (choice && incident.choice?.winner === undefined) {
      const deadline = incident.stepStartedAt + choice.ms + CHOICE_GRACE_MS
      if (current.kind === "slow" && ctx.now < deadline) {
        // The slowdown ran out first: keep crawling until the vote closes.
        return { next: extendSlow(state, incident, deadline) }
      }
      // Backstop: the poll should have closed by now. The tally or the default wins.
      return result(flow(acc, ctx, { type: "VOTE_CLOSED", target: choiceTarget(incident) }))
    }
    const next = current.kind === "slow" ? release(state, incident) : state
    return result(enterStep({ ...acc, next }, ctx, incident, step + 1))
  }
}

function choiceTarget(incident: ActiveIncident) {
  return { kind: "choice" as const, incidentId: incident.id, step: incident.step }
}

/** Keep a hosting slowdown going until `until` (its vote is still open). */
function extendSlow(state: TripState, incident: ActiveIncident, until: number): TripState {
  const id = holdId(incident)
  return {
    ...state,
    incident: { ...incident, stepEndsAt: until },
    speedFactors: state.speedFactors.map((f) => (f.id === id ? { ...f, until } : f)),
  }
}

/**
 * CHOICE_DECIDED (flow handler): the winning option's outcomes and narrative
 * apply, then the step advances. A slowdown hosting the choice advances once
 * its own time is up too; an item that already ended it ends the incident.
 */
export const choiceDecidedHandler: FlowHandler = (acc, event, ctx, emit: Emit) => {
  if (event.type !== "CHOICE_DECIDED") return acc
  const incident = acc.next.incident
  if (!incident || incident.id !== event.incidentId || incident.step !== event.step) return acc
  const step = incident.steps[incident.step]
  const choice = step?.kind === "choice" ? step.choice : step?.kind === "slow" ? step.choice : undefined
  if (!choice || incident.choice?.winner !== undefined) return acc
  const option = choice.options.find((o) => o.id === event.winner) ?? choice.options[0]!
  const recorded: ActiveIncident = {
    ...incident,
    choice: {
      ...(incident.choice ?? { vote: { phase: "decided" } }),
      winner: option.id,
      defaulted: event.defaulted,
      ...(event.votes ? { votes: event.votes } : {}),
    },
  }
  const total = event.votes?.reduce((sum, n) => sum + n, 0) ?? 0
  const body =
    total === 0
      ? `No votes. ${option.label}.`
      : event.defaulted
        ? `Tied. ${option.label}.`
        : `The room voted ${option.label}.`
  let next: Acc = {
    next: { ...acc.next, incident: recorded },
    log: [
      ...acc.log,
      {
        kind: "choice",
        eventId: incident.incident,
        question: choice.question,
        winner: option.id,
        label: option.label,
        ...(event.votes ? { votes: event.votes } : {}),
        defaulted: event.defaulted,
      },
    ],
    effects: [
      ...acc.effects,
      { type: "sign", variant: "info", icon: incident.icon, title: choice.question, body },
      ...(option.narrative?.trim() ? [{ type: "narrate" as const, body: option.narrative.trim() }] : []),
    ],
  }
  next = emit(next, {
    type: "APPLY_OUTCOMES",
    outcomes: option.outcomes,
    source: { kind: "choice", eventId: incident.incident, optionId: option.id },
  })
  const live = next.next.incident
  if (!live || live.id !== incident.id || live.step !== incident.step) return next
  const liveCtx = refresh(ctx, next.next)
  if (live.choice?.endAfter) return finishIncident(next, liveCtx, live, { quiet: true })
  if (step!.kind === "slow" && ctx.now < incident.stepStartedAt + step!.ms) return next
  const released = step!.kind === "slow" ? { ...next, next: release(next.next, live) } : next
  return enterStep(released, liveCtx, live, live.step + 1)
}

function towArrived(
  acc: Acc,
  ctx: TransitionContext,
  incident: ActiveIncident,
  siteId: string,
): TransitionResult | null {
  const site = findSite(ctx.map, siteId)
  const runtime = acc.next.sites[siteId]
  if (!site || !runtime || ctx.mile < site.mile - ARRIVAL_MILE_EPSILON) return null
  const hooked = passOnTheHook(acc, ctx)
  const towedIn = flow(hooked, ctx, { type: "SITE_TOWED_IN", siteId })
  let state = towedIn.next
  const shop = openShopAt(state, site)
  state = { ...hold(state, incident, ctx.now), shopScopeId: shop.scopeId }
  const atMechanic: ActiveIncident = { ...incident, atSiteId: siteId }
  state = { ...state, incident: atMechanic }
  const log: TripLogEvent[] = [...towedIn.log]
  if (!runtime.revealed) log.push({ kind: "site", siteId, name: site.name, phase: "revealed" })
  log.push(
    { kind: "site", siteId, name: site.name, phase: "stopped" },
    incidentEntry(incident, "towed", {
      siteId,
      siteName: site.name,
      miles: Math.max(0, site.mile - (incident.towFromMile ?? site.mile)),
    }),
  )
  const effects: TripEffect[] = [
    ...towedIn.effects,
    ...shop.close,
    {
      type: "sign",
      variant: "info",
      icon: site.icon,
      title: `Towed to ${site.name}`,
      body: shop.scopeId
        ? `${siteShopTitle(site)} is open while the van's in the bay.`
        : site.description,
    },
  ]
  const narrative = narrate(site, state.sites[siteId]?.narrativeCase)
  if (narrative) effects.push(narrative)
  effects.push(...shop.open)
  return result(enterStep({ next: state, log, effects }, ctx, atMechanic, incident.step + 1))
}

/** Whether `shortId` ends the current step: a window or slowdown that names it. */
export function itemEndsCurrentStep(state: TripState, shortId: string): boolean {
  const incident = state.incident
  const step = incident?.steps[incident.step]
  if (step?.kind !== "window" && step?.kind !== "slow") return false
  return (step.resolvesWith ?? []).includes(shortId)
}

/** Fix-a-Flat / CB Radio: end the incident they resolve. Null when there's nothing to fix. */
export function useIncidentItem(shortId: string, user: Traveler): Transition {
  return (state, ctx) => {
    const incident = state.incident
    const item = vanConsumable(shortId)
    if (!incident || !item || !itemEndsCurrentStep(state, shortId)) return null
    const step = incident.steps[incident.step]
    if (step?.kind === "slow" && step.choice && incident.choice?.winner === undefined) {
      // The slowdown ends now; the event ends once the room's vote closes.
      return {
        next: {
          ...release(state, incident),
          incident: { ...incident, choice: { ...incident.choice!, endAfter: true } },
        },
        log: [
          incidentEntry(incident, "resolved", {
            resolvedBy: { userId: user.userId, name: user.name, itemId: roadTripItemId(shortId) },
          }),
        ],
        effects: [
          {
            type: "sign",
            variant: "success",
            icon: item.emoji,
            title: `${user.name} ${item.resolvedCopy.title}`,
            body: item.resolvedCopy.body,
          },
        ],
      }
    }
    const done = finishIncident(
      {
        next: state,
        log: [
          incidentEntry(incident, "resolved", {
            resolvedBy: { userId: user.userId, name: user.name, itemId: roadTripItemId(shortId) },
          }),
        ],
        effects: [
          {
            type: "sign",
            variant: "success",
            icon: item.emoji,
            title: `${user.name} ${item.resolvedCopy.title}`,
            body: item.resolvedCopy.body,
          },
        ],
      },
      ctx,
      incident,
      { quiet: true },
    )
    return result(done)
  }
}

/** Host skips the current timed step (Quick Access). Fund steps are waived by the plugin; tows can't be skipped. */
export const skipIncidentStep: Transition = (state, ctx) => {
  const incident = state.incident
  const step = incident?.steps[incident.step]
  if (!incident || !step || step.kind === "fund" || step.kind === "tow") return null
  let acc: Acc = { next: state, log: [incidentEntry(incident, "skipped")], effects: [] }
  const hostsChoice = step.kind === "choice" || (step.kind === "slow" && step.choice)
  if (hostsChoice && incident.choice?.winner === undefined) {
    // A host skip closes the vote: the tally so far, or the default.
    acc = flow(acc, ctx, { type: "VOTE_CLOSED", target: choiceTarget(incident) })
    const live = acc.next.incident
    if (!live || live.id !== incident.id || live.step !== incident.step) return result(acc)
  }
  const live = acc.next.incident!
  const next = step.kind === "slow" ? release(acc.next, live) : acc.next
  return result(enterStep({ ...acc, next }, refresh(ctx, next), live, live.step + 1))
}

/** Install a part (D20): one per slot, announced. Refused (null) for the same part twice or outside a trip. */
export function installPart(partId: string, user: Traveler): Transition {
  return (state, { now }) => {
    if (state.status !== "loaded" && state.status !== "driving") return null
    const part = vanPart(partId)
    if (!part) return null
    const current = state.parts[part.slot]
    if (current?.partId === partId) return null
    const replaced = current ? vanPart(current.partId)?.name : undefined
    return {
      next: {
        ...state,
        parts: {
          ...state.parts,
          [part.slot]: { partId, userId: user.userId, name: user.name, at: now },
        },
      },
      log: [
        {
          kind: "part-installed",
          partId,
          slot: part.slot,
          userId: user.userId,
          name: user.name,
          ...(replaced ? { replaced } : {}),
        },
      ],
      effects: [
        {
          type: "sign",
          variant: "success",
          icon: part.emoji,
          title: `${user.name} ${part.installed}`,
          body: replaced ? `Out with the ${replaced}. ${part.description}` : part.description,
        },
      ],
    }
  }
}
