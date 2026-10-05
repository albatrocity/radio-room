import type { IncidentId, IncidentStep, TriggerableIncidentId } from "@repo/road-trip-map"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  incidentSteps,
  isDestination,
  roadTripItemId,
  sortedSites,
  vanConsumable,
  vanPart,
} from "@repo/road-trip-map"
import {
  ARRIVAL_MILE_EPSILON,
  AUTOMATIC_FUND_HOLD_MS,
  BACK_ON_THE_ROAD,
  findSite,
  fundShareCopy,
  milesLabel,
  openShopAt,
  seededIndex,
  withSite,
  type Transition,
  type TransitionContext,
  type TransitionResult,
  type TripEffect,
} from "./helpers"
import {
  gallonsLeft,
  installedPartIds,
  liveBlockers,
  type ActiveIncident,
  type Blocker,
  type FundPayment,
  type QueuedIncident,
  type TripFund,
  type TripLogEvent,
  type TripState,
} from "./state"

/**
 * The incident engine (M4): one incident at a time, one step at a time,
 * every step ending on its own (D22). Pure, like `./transitions`.
 */

type Acc = { next: TripState; log: TripLogEvent[]; effects: TripEffect[] }

type Traveler = { userId: string; name: string }

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

/** Start now, or queue behind the incident or stop in progress. Out of Gas cuts a Traffic Jam short. */
export function startOrQueueIncident(
  state: TripState,
  ctx: TransitionContext,
  queued: QueuedIncident,
): TransitionResult {
  if (state.status !== "driving") return { next: state }
  let acc: Acc = { next: state, log: [], effects: [] }
  const active = state.incident
  if (active && queued.incident === "out-of-gas" && active.incident === "traffic-jam") {
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
  return result(beginIncident({ next: { ...state, incidentQueue: rest }, log: [], effects: [] }, ctx, head))
}

function beginIncident(acc: Acc, ctx: TransitionContext, queued: QueuedIncident): Acc {
  const state = acc.next
  const spec = INCIDENTS[queued.incident]
  const seq = state.incidentSeq + 1
  const steps = incidentStepsFor(state, ctx, queued.incident)
  if (steps.length === 0) {
    const immune: Acc = {
      next: { ...state, incidentSeq: seq },
      log: [
        ...acc.log,
        { kind: "incident", incident: queued.incident, source: queued.source, step: "immune" },
      ],
      effects: [
        ...acc.effects,
        {
          type: "sign",
          variant: "success",
          icon: "🛞",
          title: "Road-Grip tires to the rescue",
          body: "Something sharp on the road. The tires shrug it off.",
        },
      ],
    }
    const queuedNext = startQueuedIncident(immune.next, ctx)
    return queuedNext
      ? {
          next: queuedNext.next,
          log: [...immune.log, ...(queuedNext.log ?? [])],
          effects: [...immune.effects, ...(queuedNext.effects ?? [])],
        }
      : immune
  }
  const incident: ActiveIncident = {
    id: `incident-${seq}`,
    incident: queued.incident,
    source: queued.source,
    steps,
    step: 0,
    stepStartedAt: ctx.now,
  }
  const started: Acc = {
    next: { ...state, incidentSeq: seq, incident },
    log: [
      ...acc.log,
      { kind: "incident", incident: queued.incident, source: queued.source, step: "started" },
    ],
    effects: [],
  }
  const entered = enterStep(started, ctx, incident, 0, { announceFund: false })
  const first = steps[0]!
  const fund = entered.next.fund?.incidentId === incident.id ? entered.next.fund : undefined
  const sign: TripEffect = {
    type: "sign",
    variant: queued.incident === "traffic-jam" ? "warning" : "error",
    icon: spec.emoji,
    title: spec.headline,
    body: `${spec.body} ${startHint(first, fund)}`.trim(),
  }
  return {
    next: entered.next,
    log: entered.log,
    effects: [...acc.effects, sign, ...entered.effects],
  }
}

function incidentStepsFor(
  state: TripState,
  ctx: TransitionContext,
  incident: IncidentId,
): IncidentStep[] {
  return incidentSteps(ctx.map, incident, { mile: ctx.mile, parts: installedPartIds(state) })
}

function startHint(step: IncidentStep, fund: TripFund | undefined): string {
  switch (step.kind) {
    case "slow":
      return "A CB Radio finds a way around."
    case "window":
      return `Got a ${itemNames(step.resolvesWith)}? Use it from the Van tab.`
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
  switch (step.kind) {
    case "slow": {
      const until = ctx.now + step.ms
      current.stepEndsAt = until
      const id = holdId(incident)
      state = {
        ...release(state, incident),
        speedFactors: [
          ...state.speedFactors.filter((f) => f.id !== id),
          { id, factor: step.factor, until, source: incident.incident },
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
        message: `${INCIDENTS[incident.incident].emoji} ${INCIDENTS[incident.incident].name}! You have a ${itemNames(step.resolvesWith)}: use it from the Van tab in the next ${Math.round(step.ms / 1000)}s.`,
      })
      break
    case "wait":
      current.stepEndsAt = ctx.now + step.ms
      state = hold(state, incident, ctx.now)
      break
    case "fund":
      return openIncidentFund(
        { next: { ...hold(state, incident, ctx.now), incident: current }, log: acc.log, effects: acc.effects },
        ctx,
        current,
        step,
        options.announceFund ?? true,
      )
    case "tow": {
      const site = findSite(ctx.map, step.siteId)
      if (!site) return enterStep(acc, ctx, incident, index + 1)
      current.towFromMile = ctx.mile
      const passed = towPast(release(state, incident), ctx, site.mile)
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
  return { next: { ...state, incident: current }, log: acc.log, effects: [...acc.effects, ...effects] }
}

/** Sites and scripted events the tow passes are skipped (M4: tow legs). */
function towPast(state: TripState, ctx: TransitionContext, targetMile: number): Acc {
  let next = state
  const log: TripLogEvent[] = []
  const effects: TripEffect[] = []
  for (const site of sortedSites(ctx.map)) {
    if (site.mile <= ctx.mile - ARRIVAL_MILE_EPSILON || site.mile > targetMile) continue
    const runtime = next.sites[site.id]
    if (!runtime || isDestination(site)) continue
    if (runtime.phase === "polling" && runtime.pollId) {
      effects.push({ type: "close-poll", pollId: runtime.pollId })
    }
    if (site.mile >= targetMile) {
      next = withSite(next, site.id, { pollId: undefined, pollOptionIds: undefined })
      continue
    }
    if (runtime.phase !== "ahead" && runtime.phase !== "polling" && runtime.phase !== "stopping")
      continue
    next = withSite(next, site.id, {
      phase: "skipped",
      pollId: undefined,
      pollOptionIds: undefined,
    })
    log.push({ kind: "site", siteId: site.id, name: site.name, phase: "skipped" })
  }
  const passedEvents = (ctx.map.scriptedEvents ?? [])
    .filter((e) => e.atMile < targetMile && !next.scriptedFired.includes(e.id))
    .map((e) => e.id)
  if (passedEvents.length > 0) {
    next = { ...next, scriptedFired: [...next.scriptedFired, ...passedEvents] }
  }
  return { next, log, effects }
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
          {
            kind: "incident",
            incident: incident.incident,
            source: incident.source,
            step: "aaa",
            resolvedBy: { userId: card.userId, name: card.name, itemId: roadTripItemId(card.partId) },
          },
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
      icon: INCIDENTS[incident.incident].emoji,
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
  let state: TripState = { ...release(acc.next, incident), incident: undefined }
  const log: TripLogEvent[] = [...acc.log]
  const effects: TripEffect[] = [...acc.effects]
  if (incident.incident === "out-of-gas") {
    const added = Math.max(0, state.tankGallons - Math.max(0, gallonsLeft(state, ctx.gallonsUsed)))
    state = {
      ...state,
      lastFill: { gallons: state.tankGallons, gallonsUsed: ctx.gallonsUsed },
      fuelFlags: [],
    }
    log.push({ kind: "fuel", level: "filled", gallons: added })
  }
  if (incident.atSiteId) {
    const site = findSite(ctx.map, incident.atSiteId)
    if (state.shopScopeId) effects.push({ type: "close-shop", scopeId: state.shopScopeId })
    state = { ...withSite(state, incident.atSiteId, { phase: "visited" }), shopScopeId: undefined }
    if (site) log.push({ kind: "site", siteId: site.id, name: site.name, phase: "departed" })
  }
  log.push({
    kind: "incident",
    incident: incident.incident,
    source: incident.source,
    step: "cleared",
  })
  if (!options.quiet) {
    if (incident.incident === "traffic-jam") {
      effects.push({
        type: "sign",
        variant: "info",
        icon: "🚗",
        title: "Traffic clears",
        body: "The jam breaks up. Back to cruising speed.",
      })
    } else if (state.status === "driving" && liveBlockers(state, ctx.now).length === 0) {
      effects.push(
        incident.incident === "out-of-gas"
          ? { type: "sign", variant: "success", icon: "⛽", title: "Fuel's in", body: "Full tank. Back on the road." }
          : BACK_ON_THE_ROAD,
      )
    }
  }
  const done: Acc = { next: state, log, effects }
  if (options.startQueue === false) return done
  const queued = startQueuedIncident(state, ctx)
  return queued
    ? {
        next: queued.next,
        log: [...log, ...(queued.log ?? [])],
        effects: [...effects, ...(queued.effects ?? [])],
      }
    : done
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

/** A scripted event's mile was reached (D23). */
export function fireScripted(eventId: string): Transition {
  return (state, ctx) => {
    if (state.status !== "driving" || state.scriptedFired.includes(eventId)) return null
    const event = ctx.map.scriptedEvents?.find((e) => e.id === eventId)
    if (!event || ctx.mile < event.atMile - ARRIVAL_MILE_EPSILON) return null
    const next = { ...state, scriptedFired: [...state.scriptedFired, eventId] }
    return startOrQueueIncident(next, ctx, {
      incident: event.incident,
      source: "scripted",
      eventId,
    })
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
    const next = current.kind === "slow" ? release(state, incident) : state
    return result(enterStep({ ...acc, next }, ctx, incident, step + 1))
  }
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
  let state = withSite(acc.next, siteId, { phase: "parked", revealed: true, visitedAt: ctx.now })
  const shop = openShopAt(state, site)
  state = { ...hold(state, incident, ctx.now), shopScopeId: shop.scopeId }
  const atMechanic: ActiveIncident = { ...incident, atSiteId: siteId }
  state = { ...state, incident: atMechanic }
  const log: TripLogEvent[] = []
  if (!runtime.revealed) log.push({ kind: "site", siteId, name: site.name, phase: "revealed" })
  log.push(
    { kind: "site", siteId, name: site.name, phase: "stopped" },
    {
      kind: "incident",
      incident: incident.incident,
      source: incident.source,
      step: "towed",
      siteId,
      siteName: site.name,
      miles: Math.max(0, site.mile - (incident.towFromMile ?? site.mile)),
    },
  )
  const effects: TripEffect[] = [
    ...shop.effects,
    {
      type: "sign",
      variant: "info",
      icon: site.icon,
      title: `Towed to ${site.name}`,
      body: shop.scopeId
        ? `${site.shop?.title ?? site.name} is open while the van's in the bay.`
        : site.description,
    },
  ]
  return result(enterStep({ next: state, log, effects }, ctx, atMechanic, incident.step + 1))
}

/** Fix-a-Flat / CB Radio: end the incident they resolve. Null when there's nothing to fix. */
export function useIncidentItem(shortId: string, user: Traveler): Transition {
  return (state, ctx) => {
    const incident = state.incident
    const item = vanConsumable(shortId)
    if (!incident || !item || item.resolves !== incident.incident) return null
    const step = incident.steps[incident.step]
    const usable =
      (step?.kind === "window" && step.resolvesWith.includes(shortId)) || step?.kind === "slow"
    if (!usable) return null
    const done = finishIncident(
      {
        next: state,
        log: [
          {
            kind: "incident",
            incident: incident.incident,
            source: incident.source,
            step: "resolved",
            resolvedBy: { userId: user.userId, name: user.name, itemId: roadTripItemId(shortId) },
          },
        ],
        effects: [
          {
            type: "sign",
            variant: "success",
            icon: item.emoji,
            title:
              incident.incident === "traffic-jam"
                ? `${user.name} found a way around`
                : `${user.name} patched the tire`,
            body:
              incident.incident === "traffic-jam"
                ? "A trucker on channel 19 knew a back road. Back to cruising speed."
                : `${item.name} to the rescue. Back on the road.`,
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
  const next = step.kind === "slow" ? release(state, incident) : state
  return result(
    enterStep(
      {
        next,
        log: [{ kind: "incident", incident: incident.incident, source: incident.source, step: "skipped" }],
        effects: [],
      },
      ctx,
      incident,
      incident.step + 1,
    ),
  )
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
        parts: { ...state.parts, [part.slot]: { partId, userId: user.userId, name: user.name, at: now } },
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
