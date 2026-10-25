import { routeMiles } from "./derive"
import {
  MAIN_ROUTE_ID,
  type JunctionDecision,
  type TripAltRoute,
  type TripEvent,
  type TripMap,
  type TripSite,
} from "./schema"

/**
 * Trip geometry (ADR 0222). The only module that reads an authored `site.mile`
 * or `event.mile`: everything else works on a `PathMap`, the map laid flat
 * along the van's path, with every active site and event at its odometer mile.
 * A linear map (no routes, no layers) comes back unchanged, so every derive
 * helper keeps its meaning.
 */

declare const pathMapBrand: unique symbol

/** A map laid flat along one path: miles are odometer miles, inactive content is gone. */
export type PathMap = TripMap & { readonly [pathMapBrand]: true }

/** A stretch of road the van turned onto: its route, where on it, and the odometer then. */
export type PathLeg = { route: string; fromMile: number; odometerStart: number }

/** What decides the path: where the van has driven, which layers are live, and fork decisions. */
export type TripView = {
  /** Legs driven so far; the last is the one the van is on. */
  legs: readonly PathLeg[]
  layersActive: ReadonlySet<string>
  /** Decided forks only. Undecided forks count as "stay" everywhere. */
  junctionDecisions: Readonly<Record<string, JunctionDecision>>
  /** Forks already taken or passed: never placed again. */
  junctionsDone: ReadonlySet<string>
  /** Sites and events kept although their layer is locked (a decided stop, a running event). */
  keep: ReadonlySet<string>
}

export const START_LEG: PathLeg = { route: MAIN_ROUTE_ID, fromMile: 0, odometerStart: 0 }

/** A fresh trip's view: on main from mile 0, nothing unlocked or decided. */
export function startView(): TripView {
  return {
    legs: [START_LEG],
    layersActive: new Set(),
    junctionDecisions: {},
    junctionsDone: new Set(),
    keep: new Set(),
  }
}

export type PathSegment = {
  route: string
  fromMile: number
  toMile: number
  odometerStart: number
  /** Already driven (a closed leg). */
  driven: boolean
}

/** A fork on the path, at its odometer mile. */
export type PlacedFork = { routeId: string; odometer: number; decision?: JunctionDecision }

/** Where an alternate route the path follows ends (a rejoin), at its odometer mile. */
export type PlacedRouteEnd = {
  routeId: string
  odometer: number
  /** The leg the van continues on. */
  next: PathLeg
  /** Parent sites between the fork and the rejoin, which the route skips. */
  bypasses: string[]
}

export type LinearPath = {
  map: PathMap
  segments: PathSegment[]
  /** Forks not yet taken or passed, whose layer gate is open. */
  forks: PlacedFork[]
  /** Rejoins ahead on the path. */
  ends: PlacedRouteEnd[]
  /** Odometer miles to the path's destination. */
  miles: number
}

export function altRoute(map: Pick<TripMap, "routes">, id: string): TripAltRoute | undefined {
  return map.routes?.find((route) => route.id === id)
}

/** A route's length in miles: `map.route` for main, its own drive minutes at base speed otherwise. */
export function routeLength(map: TripMap, id: string): number {
  if (id === MAIN_ROUTE_ID) return routeMiles(map.route)
  const route = altRoute(map, id)
  return route ? (map.route.baseMph * route.driveMinutes) / 60 : 0
}

export function siteRoute(item: { route?: string }): string {
  return item.route ?? MAIN_ROUTE_ID
}

export function forkParent(route: TripAltRoute): string {
  return route.from.route ?? MAIN_ROUTE_ID
}

export function rejoinRoute(route: TripAltRoute): string | undefined {
  return route.end.kind === "rejoin" ? (route.end.route ?? forkParent(route)) : undefined
}

/** Whether `item`'s layer (if any) is live in `view`, or it's kept as a commitment. */
function isActive(item: { id: string; layer?: string }, view: TripView): boolean {
  return !item.layer || view.layersActive.has(item.layer) || view.keep.has(item.id)
}

/** The fork exists only while its layer (if any) is unlocked. */
export function forkOpen(route: TripAltRoute, view: Pick<TripView, "layersActive">): boolean {
  return !route.layer || view.layersActive.has(route.layer)
}

const MAX_SEGMENTS = 24

function isLinear(map: TripMap, view: TripView): boolean {
  return (
    !map.routes?.length &&
    !map.layers?.length &&
    view.legs.length === 1 &&
    view.legs[0]!.route === MAIN_ROUTE_ID &&
    view.legs[0]!.fromMile === 0 &&
    view.legs[0]!.odometerStart === 0
  )
}

/** Segments from the trip start to the destination: driven legs, then the road ahead. */
export function pathSegments(map: TripMap, view: TripView): PathSegment[] {
  const segments: PathSegment[] = []
  const legs = view.legs.length > 0 ? view.legs : [START_LEG]
  for (let i = 0; i < legs.length - 1; i++) {
    const leg = legs[i]!
    const next = legs[i + 1]!
    segments.push({
      route: leg.route,
      fromMile: leg.fromMile,
      toMile: leg.fromMile + (next.odometerStart - leg.odometerStart),
      odometerStart: leg.odometerStart,
      driven: true,
    })
  }
  let { route, fromMile, odometerStart } = legs[legs.length - 1]!
  // A fork is taken at most once per path (a "return" route comes back to its own fork).
  const taken = new Set(legs.map((leg) => leg.route))
  for (let guard = 0; guard < MAX_SEGMENTS; guard++) {
    const take = (map.routes ?? [])
      .filter(
        (alt) =>
          forkParent(alt) === route &&
          alt.from.mile >= fromMile &&
          !taken.has(alt.id) &&
          !view.junctionsDone.has(alt.id) &&
          view.junctionDecisions[alt.id] === "take" &&
          forkOpen(alt, view),
      )
      .sort((a, b) => a.from.mile - b.from.mile)[0]
    if (take) {
      taken.add(take.id)
      segments.push({ route, fromMile, toMile: take.from.mile, odometerStart, driven: false })
      odometerStart += take.from.mile - fromMile
      route = take.id
      fromMile = 0
      continue
    }
    const length = routeLength(map, route)
    const toMile = Math.max(fromMile, length)
    segments.push({ route, fromMile, toMile, odometerStart, driven: false })
    const alt = altRoute(map, route)
    const rejoin = alt ? rejoinRoute(alt) : undefined
    if (!alt || !rejoin || alt.end.kind !== "rejoin") break
    const rejoinMile = alt.end.mile
    odometerStart += toMile - fromMile
    route = rejoin
    fromMile = rejoinMile
  }
  return segments
}

function placeOn<T extends { id: string; mile?: number; route?: string; layer?: string }>(
  items: readonly T[],
  segments: PathSegment[],
  view: TripView,
): { item: T; odometer: number }[] {
  const placed: { item: T; odometer: number }[] = []
  const seen = new Set<string>()
  for (const segment of segments) {
    for (const item of items) {
      if (item.mile === undefined || seen.has(item.id)) continue
      if (siteRoute(item) !== segment.route || !isActive(item, view)) continue
      if (item.mile < segment.fromMile - 1e-9 || item.mile > segment.toMile + 1e-9) continue
      seen.add(item.id)
      placed.push({ item, odometer: segment.odometerStart + (item.mile - segment.fromMile) })
    }
  }
  return placed
}

const cache = new WeakMap<TripMap, Map<string, LinearPath>>()

function viewKey(view: TripView): string {
  return JSON.stringify([
    view.legs,
    Array.from(view.layersActive).sort(),
    Object.entries(view.junctionDecisions).sort(),
    Array.from(view.junctionsDone).sort(),
    Array.from(view.keep).sort(),
  ])
}

/**
 * `map` laid flat along `view`'s path. Sites and mile events on the path's
 * segments, with their layer live, at odometer miles; fuel events whose layer
 * is live. `route` is the path's length (drive minutes and tanks per trip
 * scaled, so the base burn per mile is unchanged).
 */
export function linearize(map: TripMap, view: TripView): LinearPath {
  if (isLinear(map, view)) {
    const miles = routeMiles(map.route)
    return {
      map: map as PathMap,
      segments: [
        { route: MAIN_ROUTE_ID, fromMile: 0, toMile: miles, odometerStart: 0, driven: false },
      ],
      forks: [],
      ends: [],
      miles,
    }
  }
  const key = viewKey(view)
  let byView = cache.get(map)
  const hit = byView?.get(key)
  if (hit) return hit

  const segments = pathSegments(map, view)
  const last = segments[segments.length - 1]!
  const miles = last.odometerStart + (last.toMile - last.fromMile)
  const sites: TripSite[] = placeOn(map.sites, segments, view).map(({ item, odometer }) => ({
    ...item,
    mile: odometer,
  }))
  const mileEventsPlaced = placeOn(
    (map.events ?? []).filter((e) => (e.trigger ?? "mile") === "mile"),
    segments,
    view,
  ).map(({ item, odometer }): TripEvent => ({ ...item, mile: odometer }))
  const otherEvents = (map.events ?? []).filter(
    (e) => (e.trigger ?? "mile") !== "mile" && isActive(e, view),
  )
  const mainMiles = routeMiles(map.route)
  const linear = {
    ...map,
    route: {
      ...map.route,
      driveMinutes: (miles * 60) / map.route.baseMph,
      tanksPerTrip:
        mainMiles > 0 ? (map.route.tanksPerTrip * miles) / mainMiles : map.route.tanksPerTrip,
    },
    sites,
    ...(map.events ? { events: [...mileEventsPlaced, ...otherEvents] } : {}),
  } as PathMap

  const forks: PlacedFork[] = []
  const ends: PlacedRouteEnd[] = []
  const placedForks = new Set<string>()
  segments.forEach((segment, index) => {
    if (segment.driven) return
    for (const alt of map.routes ?? []) {
      if (
        forkParent(alt) !== segment.route ||
        view.junctionsDone.has(alt.id) ||
        !forkOpen(alt, view)
      ) {
        continue
      }
      if (alt.from.mile < segment.fromMile - 1e-9 || alt.from.mile > segment.toMile + 1e-9) continue
      // Once per path: a taken fork sits where the path turns; a route already on the path is behind.
      if (placedForks.has(alt.id) || segments.slice(0, index + 1).some((s) => s.route === alt.id))
        continue
      const decision = view.junctionDecisions[alt.id]
      if (decision === "take" && segments[index + 1]?.route !== alt.id) continue
      placedForks.add(alt.id)
      forks.push({
        routeId: alt.id,
        odometer: segment.odometerStart + (alt.from.mile - segment.fromMile),
        ...(decision ? { decision } : {}),
      })
    }
    const alt = altRoute(map, segment.route)
    const next = segments[index + 1]
    if (alt?.end.kind === "rejoin" && next && segment.toMile >= routeLength(map, alt.id) - 1e-9) {
      const parent = forkParent(alt)
      const target = rejoinRoute(alt)!
      const rejoinMile = alt.end.mile
      const bypasses =
        target === parent
          ? map.sites
              .filter(
                (site) =>
                  siteRoute(site) === parent &&
                  site.mile > alt.from.mile + 1e-9 &&
                  site.mile < rejoinMile - 1e-9,
              )
              .map((site) => site.id)
          : []
      ends.push({
        routeId: alt.id,
        odometer: next.odometerStart,
        next: { route: next.route, fromMile: next.fromMile, odometerStart: next.odometerStart },
        bypasses,
      })
    }
  })
  forks.sort((a, b) => a.odometer - b.odometer)

  const result: LinearPath = { map: linear, segments, forks, ends, miles }
  if (!byView) {
    byView = new Map()
    cache.set(map, byView)
  }
  if (byView.size > 64) byView.clear()
  byView.set(key, result)
  return result
}

export type EnumeratedPath = {
  decisions: Record<string, JunctionDecision>
  path: LinearPath
}

/**
 * Every distinct path through the map's forks with every layer live, capped
 * at `cap` decision combinations. Above the cap, only the all-"stay" path
 * (`capped: true`). For lint and `describeTripFlow`.
 */
export function enumeratePaths(
  map: TripMap,
  cap = 32,
): { paths: EnumeratedPath[]; capped: boolean } {
  const allLayers = new Set((map.layers ?? []).map((layer) => layer.id))
  const routes = map.routes ?? []
  const viewFor = (decisions: Record<string, JunctionDecision>): TripView => ({
    ...startView(),
    layersActive: allLayers,
    junctionDecisions: decisions,
  })
  const combos = 2 ** routes.length
  if (combos > cap) {
    return { paths: [{ decisions: {}, path: linearize(map, viewFor({})) }], capped: true }
  }
  const seen = new Set<string>()
  const paths: EnumeratedPath[] = []
  for (let mask = 0; mask < combos; mask++) {
    const decisions: Record<string, JunctionDecision> = {}
    routes.forEach((route, i) => {
      decisions[route.id] = mask & (1 << i) ? "take" : "stay"
    })
    const path = linearize(map, viewFor(decisions))
    const signature = JSON.stringify(path.segments.map((s) => [s.route, s.fromMile, s.toMile]))
    if (seen.has(signature)) continue
    seen.add(signature)
    const taken: Record<string, JunctionDecision> = {}
    for (const segment of path.segments) {
      if (segment.route !== MAIN_ROUTE_ID) taken[segment.route] = "take"
    }
    paths.push({ decisions: taken, path })
  }
  return { paths, capped: false }
}

/** A short label for a path ("Main", "Main → Scenic Byway → Main"). */
export function pathLabel(map: TripMap, path: LinearPath): string {
  const names = path.segments.map((segment) =>
    segment.route === MAIN_ROUTE_ID
      ? "Main"
      : (altRoute(map, segment.route)?.name ?? segment.route),
  )
  return names.filter((name, i) => name !== names[i - 1]).join(" → ")
}
