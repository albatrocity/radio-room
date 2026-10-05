import type {
  TripMap,
  TripStore,
  TripStoreIncident,
  TripStoreLive,
  TripStoreSite,
  TripStoreVanSheet,
  TripSite,
  VanFactor,
} from "@repo/road-trip-map"
import {
  compileVan,
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  isDestination,
  isGasSite,
  isSecretSite,
  itemsResolving,
  PART_SLOTS,
  parkPlan,
  resolveSiteSettings,
  roadTripItemId,
  skipDefaultsAhead,
  sortedSites,
  vanPart,
  type StopDecision,
} from "@repo/road-trip-map"
import { hasSiteShop, nextSiteAhead } from "./helpers"
import { MS_PER_HOUR, project, type Leg } from "./ledger"
import {
  cruisingMph,
  currentIncidentStep,
  effectiveGpm,
  installedPartIds,
  liveBlockers,
  tankAt,
  type TripState,
} from "./state"

export type TripStoreExtras = {
  /** Session `costScale` (1 without a session). */
  costScale: number
  /** Voluntary pool total for the open fund, when there is one. */
  poolRaised?: number
}

/** Client projection of the trip (M7 store payload). Pure. */
export function buildTripStore(
  state: TripState,
  map: TripMap,
  current: Leg,
  now: number,
  extras: TripStoreExtras = { costScale: 1 },
): TripStore {
  const anchorMile = Math.min(state.routeMiles, project(current, now).mile)
  const anchorGallons = tankAt(state, current, now)
  const sites: TripStoreSite[] = []
  let visitedCount = 0
  for (const site of sortedSites(map)) {
    const runtime = state.sites[site.id]
    if (!runtime) continue
    if (runtime.visitedAt !== undefined) visitedCount++
    if (!runtime.revealed) {
      if (isSecretSite(site)) continue
      sites.push({ id: site.id, mile: site.mile, state: "unrevealed" })
      continue
    }
    const entry: TripStoreSite = {
      id: site.id,
      mile: site.mile,
      state: runtime.phase,
      name: site.name,
      description: site.description,
      icon: site.icon,
    }
    if (site.imageUrl) entry.imageUrl = site.imageUrl
    if (isDestination(site)) entry.destination = true
    else if (!resolveSiteSettings(map, site).optional) entry.mandatory = true
    if (hasSiteShop(site)) entry.shopTitle = site.shop?.title ?? site.name
    if (isGasSite(site)) entry.gasPrice = site.services!.gas!.pricePerGallon
    if (site.services?.mechanic) entry.mechanic = true
    if (runtime.visitedAt !== undefined) {
      entry.visitedAt = runtime.visitedAt
      if (site.lore) entry.lore = site.lore
      if (site.model) entry.modelUrl = site.model.url
    }
    if (runtime.votes) entry.votes = runtime.votes
    if (runtime.defaulted !== undefined) entry.defaulted = runtime.defaulted
    sites.push(entry)
  }

  const store: TripStore = {
    status: state.status,
    tripId: state.tripId,
    mapTitle: state.map.title,
    routeMiles: state.routeMiles,
    sites,
    van: { anchorAt: now, anchorMile, mph: current.mph },
    fuel: {
      anchorAt: now,
      anchorGallons,
      // Burn stops at empty so the client gauge clamps too.
      gallonsPerMile: anchorGallons > 0 ? current.gpm : 0,
      drivingGallonsPerMile: effectiveGpm(state),
      tank: state.tankGallons,
      lowPct: map.tuning.lowFuelPct,
    },
    funds: { mode: state.fundsMode },
    costScale: extras.costScale,
    eta: {
      projectedArrivalAt: projectArrival(state, map, anchorMile, now, anchorGallons),
      targetArrivalAt: state.targetArrivalAt ?? null,
    },
    vanSheet: buildVanSheet(state, now),
    visitedCount,
    siteCount: map.sites.filter((s) => !isSecretSite(s) || state.sites[s.id]?.revealed).length,
  }
  const live = liveContext(state, map, now, extras)
  if (live) store.live = live
  if (state.departedAt !== undefined) store.departedAt = state.departedAt
  if (state.arrivedAt !== undefined) store.arrivedAt = state.arrivedAt
  if (state.endedAt !== undefined) store.endedAt = state.endedAt
  return store
}

/** Van tab: parts by slot, the factors shaping speed and burn, and the incident in progress. */
function buildVanSheet(state: TripState, now: number): TripStoreVanSheet {
  const van = compileVan(installedPartIds(state))
  const parts = PART_SLOTS.flatMap(({ slot }) => {
    const installed = state.parts[slot]
    const part = installed ? vanPart(installed.partId) : undefined
    return installed && part
      ? [{ slot, partId: part.shortId, name: part.name, emoji: part.emoji, installedBy: installed.name }]
      : []
  })
  const timed: VanFactor[] = state.speedFactors
    .filter((f) => f.until === undefined || f.until > now)
    .map((f) => ({
      source: f.source,
      label: f.source in INCIDENTS ? INCIDENTS[f.source as keyof typeof INCIDENTS].name : f.source,
      factor: f.factor,
    }))
  const sheet: TripStoreVanSheet = {
    parts,
    baseMph: state.baseMph,
    cruisingMph: cruisingMph(state, now),
    speedFactors: [...van.speedFactors, ...timed],
    mpgFactors: van.mpgFactors,
    queued: state.incidentQueue.length,
  }
  const incident = incidentView(state)
  if (incident) sheet.incident = incident
  return sheet
}

function incidentView(state: TripState): TripStoreIncident | undefined {
  const incident = state.incident
  const step = currentIncidentStep(state)
  if (!incident || !step) return undefined
  const spec = INCIDENTS[incident.incident]
  const label =
    step.kind === "fund"
      ? `${FUND_PURPOSE_LABELS[step.purpose]}${state.fund ? ` · ${state.fund.cost} coins` : ""}`
      : step.label
  return {
    incident: incident.incident,
    name: (step.kind === "wait" && step.status) || spec.name,
    emoji: spec.emoji,
    step: label,
    stepKind: step.kind,
    ...(incident.stepEndsAt !== undefined ? { endsAt: incident.stepEndsAt } : {}),
    resolvesWith:
      step.kind === "window" || step.kind === "slow"
        ? itemsResolving(incident.incident).map(roadTripItemId)
        : [],
  }
}

function fundLabel(state: TripState, map: TripMap): string {
  const fund = state.fund!
  if (fund.purpose === "gas") {
    const site = map.sites.find((s) => s.id === fund.siteId)
    return fund.mode === "voluntary" ? "Gas money" : `Pumping gas at ${site?.name ?? "the station"}`
  }
  const label = FUND_PURPOSE_LABELS[fund.purpose]
  return fund.mode === "voluntary" ? `${label} money` : `Paying ${fund.provider ?? label.toLowerCase()}`
}

function liveContext(
  state: TripState,
  map: TripMap,
  now: number,
  extras: TripStoreExtras,
): TripStoreLive | undefined {
  const blockers = liveBlockers(state, now)
  const fund = state.fund
  if (fund && state.status === "driving") {
    const raised = fund.mode === "voluntary" ? (extras.poolRaised ?? 0) : fund.collected
    return {
      kind: "fund",
      label: fundLabel(state, map),
      purpose: fund.purpose,
      mode: fund.mode,
      ...(fund.siteId ? { siteId: fund.siteId } : {}),
      cost: fund.cost,
      ...(raised !== undefined ? { raised } : {}),
      endsAt: fund.endsAt,
    }
  }
  const incident = state.status === "driving" ? incidentView(state) : undefined
  if (incident) {
    return {
      kind: "incident",
      label: `${incident.emoji} ${incident.name} · ${incident.step}`,
      incident: incident.incident,
      name: incident.name,
      ...(incident.endsAt !== undefined ? { endsAt: incident.endsAt } : {}),
      ...(incident.resolvesWith.length > 0 ? { resolvesWith: incident.resolvesWith } : {}),
    }
  }
  const parked = blockers.find((b) => b.kind === "parked")
  if (parked?.siteId && parked.until !== undefined) {
    const site = map.sites.find((s) => s.id === parked.siteId)
    return {
      kind: "parked",
      label: site?.name ?? "Parked",
      siteId: parked.siteId,
      endsAt: parked.until,
      shopOpen: state.shopScopeId !== undefined,
    }
  }
  if (blockers.some((b) => b.kind === "no-session"))
    return { kind: "paused", label: "No game session" }
  if (blockers.some((b) => b.kind === "admin-pause")) return { kind: "paused", label: "Paused" }
  return undefined
}

/**
 * Arrival estimate from now at cruising speed, plus the rest of the current
 * stop and the upcoming stops `parkPlan` expects (mandatory, decided stop, or
 * undecided with a "stop" default).
 */
export function projectArrival(
  state: TripState,
  map: TripMap,
  mile: number,
  now: number,
  gallons: number,
): number | null {
  if (state.status === "arrived" || state.status === "late") return state.arrivedAt ?? null
  if (state.status !== "driving") return null
  const mph = cruisingMph(state, now)
  if (mph <= 0) return null
  let ms = ((state.routeMiles - mile) / mph) * MS_PER_HOUR
  // Parallel holds (parked + gas fund) delay the van by the longest one.
  let holdUntil = now
  for (const blocker of liveBlockers(state, now)) {
    if ((blocker.kind === "parked" || blocker.kind === "fund") && blocker.until !== undefined) {
      holdUntil = Math.max(holdUntil, blocker.until)
    }
  }
  // Only the current incident step's own end is known; later steps aren't forecast.
  const step = currentIncidentStep(state)
  if (step && step.kind !== "slow" && state.incident?.stepEndsAt !== undefined) {
    holdUntil = Math.max(holdUntil, state.incident.stepEndsAt)
  }
  ms += holdUntil - now
  const decisionFor = (site: TripSite): StopDecision => {
    const phase = state.sites[site.id]?.phase
    if (phase === "stopping") return "stop"
    if (phase === "ahead" || phase === "polling") return undefined
    return "skip"
  }
  ms += parkPlan(map, {
    afterMile: mile,
    decisionFor,
    defaultFor: skipDefaultsAhead(map, {
      fromMile: mile,
      gallons,
      gallonsPerMile: effectiveGpm(state),
      decisionFor,
    }),
  }).expectedMs
  return Math.round(now + ms)
}

/** Quick Access status lines (public: never names an unrevealed site). */
export type TripStatusLines = {
  tripProgress: string
  tripEta: string
  tripNextSite: string
  tripFuel: string
  tripWarnings: string
}

const FUNDS_LABEL = { automatic: "automatic (split by wealth)", voluntary: "voluntary (chip in)" }

const STATUS_LABEL: Record<TripState["status"], string> = {
  loaded: "Loaded, not departed",
  driving: "Driving",
  arrived: "Arrived",
  late: "Arrived late",
  ended: "Ended",
  stranded: "Ended before arrival",
}

export function buildStatusLines(
  state: TripState,
  map: TripMap,
  store: TripStore,
  extraWarnings: string[] = [],
): TripStatusLines {
  const mile = store.van.anchorMile
  const progress = `${STATUS_LABEL[state.status]} · ${map.title} · ${round1(mile)} / ${round1(state.routeMiles)} mi · ${store.visitedCount} / ${store.siteCount} visited`

  let eta = "—"
  const { projectedArrivalAt, targetArrivalAt } = store.eta
  if (projectedArrivalAt !== null && targetArrivalAt !== null) {
    const deltaMin = Math.round((projectedArrivalAt - targetArrivalAt) / 60_000)
    eta =
      deltaMin === 0
        ? "On target"
        : deltaMin > 0
          ? `${deltaMin} min behind target`
          : `${-deltaMin} min ahead of target`
  } else if (state.status === "loaded") {
    eta = `${map.route.driveMinutes} min drive`
  }

  const next = state.status === "driving" ? nextSiteAhead(state, map, mile) : undefined
  let nextSite = "—"
  if (next) {
    if (state.sites[next.id]?.revealed) nextSite = `${next.name} · mile ${round1(next.mile)}`
    else if (!isSecretSite(next)) nextSite = `? · mile ${round1(next.mile)}`
  }

  const { anchorGallons, tank } = store.fuel
  const fuelPct = tank > 0 ? Math.round((anchorGallons / tank) * 100) : 0
  const fuel = `Gas ${fuelPct}% · Funds: ${FUNDS_LABEL[state.fundsMode]}`

  const warnings = [...extraWarnings]
  if (store.live?.kind === "paused") warnings.unshift(store.live.label)
  if (store.live?.kind === "fund") {
    const label = FUND_PURPOSE_LABELS[store.live.purpose]
    warnings.unshift(
      store.live.mode === "voluntary"
        ? `${label} pool ${store.live.raised ?? 0} / ${store.live.cost}`
        : `Paying for ${label.toLowerCase()}: ${store.live.cost} coins`,
    )
  }
  const incident = store.vanSheet.incident
  if (incident && state.status === "driving") {
    warnings.unshift(`${incident.emoji} ${incident.name}: ${incident.step}`)
  }
  if (store.vanSheet.queued > 0) warnings.push(`${store.vanSheet.queued} incident(s) queued`)
  if (state.status === "driving" && incident?.incident !== "out-of-gas") {
    if (state.fuelFlags.includes("empty") && !incident) warnings.push("Out of gas")
    else if (state.fuelFlags.includes("low")) warnings.push("Low fuel")
  }
  return {
    tripProgress: progress,
    tripEta: eta,
    tripNextSite: nextSite,
    tripFuel: fuel,
    tripWarnings: warnings.length > 0 ? warnings.join(" · ") : "None",
  }
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}
