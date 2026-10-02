import type { TripMap, TripStore, TripStoreLive, TripStoreSite } from "@repo/road-trip-map"
import { isDestination, parkPlan, resolveSiteSettings, sortedSites } from "@repo/road-trip-map"
import { MS_PER_HOUR, project, type Leg } from "./ledger"
import { cruisingMph, liveBlockers, type TripState } from "./state"
import { nextSiteAhead } from "./transitions"

/** Client projection of the trip (M7 store payload). Pure. */
export function buildTripStore(
  state: TripState,
  map: TripMap,
  current: Leg,
  now: number,
): TripStore {
  const anchorMile = Math.min(state.routeMiles, project(current, now).mile)
  const sites: TripStoreSite[] = []
  let visitedCount = 0
  for (const site of sortedSites(map)) {
    const runtime = state.sites[site.id]
    if (!runtime) continue
    if (runtime.visitedAt !== undefined) visitedCount++
    if (!runtime.revealed) {
      if (site.secret) continue
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
    if (site.shop?.shopIds?.length) entry.shopTitle = site.shop.title ?? site.name
    if (runtime.visitedAt !== undefined) {
      entry.visitedAt = runtime.visitedAt
      if (site.lore) entry.lore = site.lore
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
    eta: {
      projectedArrivalAt: projectArrival(state, map, anchorMile, now),
      targetArrivalAt: state.targetArrivalAt ?? null,
    },
    visitedCount,
    siteCount: map.sites.filter((s) => !s.secret || state.sites[s.id]?.revealed).length,
  }
  const live = liveContext(state, map, now)
  if (live) store.live = live
  if (state.departedAt !== undefined) store.departedAt = state.departedAt
  if (state.arrivedAt !== undefined) store.arrivedAt = state.arrivedAt
  if (state.endedAt !== undefined) store.endedAt = state.endedAt
  return store
}

function liveContext(state: TripState, map: TripMap, now: number): TripStoreLive | undefined {
  const blockers = liveBlockers(state, now)
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
): number | null {
  if (state.status === "arrived" || state.status === "late") return state.arrivedAt ?? null
  if (state.status !== "driving") return null
  const mph = cruisingMph(state, now)
  if (mph <= 0) return null
  let ms = ((state.routeMiles - mile) / mph) * MS_PER_HOUR
  for (const blocker of liveBlockers(state, now)) {
    if (blocker.kind === "parked" && blocker.until !== undefined) ms += blocker.until - now
  }
  ms += parkPlan(map, {
    afterMile: mile,
    decisionFor: (site) => {
      const phase = state.sites[site.id]?.phase
      if (phase === "stopping") return "stop"
      if (phase === "ahead" || phase === "polling") return undefined
      return "skip"
    },
  }).expectedMs
  return Math.round(now + ms)
}

/** Quick Access status lines (public: never names an unrevealed site). */
export type TripStatusLines = {
  tripProgress: string
  tripEta: string
  tripNextSite: string
  tripWarnings: string
}

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
    const runtime = state.sites[next.id]
    nextSite = runtime?.revealed
      ? `${next.name} · mile ${round1(next.mile)}`
      : `? · mile ${round1(next.mile)}`
  }

  const warnings = [...extraWarnings]
  if (store.live?.kind === "paused") warnings.unshift(store.live.label)
  return {
    tripProgress: progress,
    tripEta: eta,
    tripNextSite: nextSite,
    tripWarnings: warnings.length > 0 ? warnings.join(" · ") : "None",
  }
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}
