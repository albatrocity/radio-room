import { fuelPlan, parkPlan } from "./derive"
import { enumeratePaths, forkParent, pathLabel, rejoinRoute, routeLength, siteRoute } from "./paths"
import type { JunctionDecision, TripMap, TripOutcome } from "./schema"
import { tripMapItemShortId } from "./tripMaps"
import { roadTripItemId } from "./van"
/**
 * How a trip map flows, for authors (ADR 0222): the road network, which
 * layers exist and what unlocks them, what diverts to each route, and every
 * path through the forks with its length and fuel. Game Studio's Flow panel
 * renders this; lint reads the same sources, so the two can't disagree.
 */

export type OutcomeSourceRef = {
  outcome: TripOutcome
  /** JSON path of the outcome, for editor highlighting. */
  path: string
  /** "Welcome Center", "Road closed (Detour)". */
  name: string
  /** The source's route and route mile, when it has one (sites and mile events). */
  route?: string
  mile?: number
}

/** Every outcome in the map, with where it's authored. */
export function outcomeSources(map: TripMap): OutcomeSourceRef[] {
  const out: OutcomeSourceRef[] = []
  map.sites.forEach((site, index) => {
    ;(site.onVisit ?? []).forEach((outcome, i) =>
      out.push({
        outcome,
        path: `sites.${index}.onVisit.${i}`,
        name: site.name,
        route: siteRoute(site),
        mile: site.mile,
      }),
    )
    ;(site.onDepart ?? []).forEach((outcome, i) =>
      out.push({
        outcome,
        path: `sites.${index}.onDepart.${i}`,
        name: `${site.name}, on departure`,
        route: siteRoute(site),
        mile: site.mile,
      }),
    )
  })
  ;(map.events ?? []).forEach((event, index) => {
    const at = event.mile !== undefined ? { route: siteRoute(event), mile: event.mile } : {}
    ;(event.outcomes ?? []).forEach((outcome, i) =>
      out.push({ outcome, path: `events.${index}.outcomes.${i}`, name: event.name, ...at }),
    )
    ;(event.resolution ?? []).forEach((entry, r) => {
      if (entry.kind !== "choice") return
      entry.options.forEach((option, o) =>
        option.outcomes.forEach((outcome, i) =>
          out.push({
            outcome,
            path: `events.${index}.resolution.${r}.options.${o}.outcomes.${i}`,
            name: `${event.name} (${option.label})`,
            ...at,
          }),
        ),
      )
    })
  })
  return out
}

export type TripFlowRoute = {
  id: string
  name: string
  icon?: string
  /** Parent route id and the route-local mile of the fork. */
  from: { route: string; mile: number }
  end: { kind: "rejoin"; route: string; mile: number } | { kind: "destination" }
  entry: { kind: "vote"; default: JunctionDecision; mystery: boolean } | { kind: "outcome" }
  /** The layer that must be unlocked for the fork to exist. */
  layer?: string
  miles: number
  /** Sources whose outcomes divert to it. */
  divertedBy: string[]
}

export type TripFlowLayer = {
  id: string
  name: string
  icon: string
  unlockedBy: string[]
  lockedBy: string[]
  /** Names of the trip maps whose use unlocks it (ADR 0227). */
  maps: string[]
  sites: string[]
  events: string[]
  /** Routes whose fork it gates. */
  forks: string[]
}

export type TripFlowPath = {
  label: string
  decisions: Record<string, JunctionDecision>
  miles: number
  driveMinutes: number
  /** Parking expected if nobody votes. */
  expectedParkMinutes: number
  /** Where the tank runs dry if nobody votes, or null. */
  emptyAtMile: number | null
  destination?: string
}

/** A map the trip sells and the layers that opt into it (ADR 0227). */
export type TripFlowMap = {
  id: string
  name: string
  icon: string
  layers: string[]
  /** Sites whose shop sells it. */
  soldAt: string[]
}

export type TripFlowOutline = {
  routes: TripFlowRoute[]
  layers: TripFlowLayer[]
  maps: TripFlowMap[]
  paths: TripFlowPath[]
  /** Too many fork combinations: `paths` lists the main road only. */
  capped: boolean
}

export function describeTripFlow(map: TripMap): TripFlowOutline {
  const sources = outcomeSources(map)
  const routes: TripFlowRoute[] = (map.routes ?? []).map((route) => ({
    id: route.id,
    name: route.name,
    ...(route.icon ? { icon: route.icon } : {}),
    from: { route: forkParent(route), mile: route.from.mile },
    end:
      route.end.kind === "rejoin"
        ? { kind: "rejoin", route: rejoinRoute(route)!, mile: route.end.mile }
        : { kind: "destination" },
    entry:
      route.entry.kind === "vote"
        ? { kind: "vote", default: route.entry.default, mystery: route.entry.mystery === true }
        : { kind: "outcome" },
    ...(route.layer ? { layer: route.layer } : {}),
    miles: routeLength(map, route.id),
    divertedBy: sources
      .filter((s) => s.outcome.kind === "divert" && s.outcome.route === route.id)
      .map((s) => s.name),
  }))
  const layers: TripFlowLayer[] = (map.layers ?? []).map((layer) => ({
    id: layer.id,
    name: layer.name,
    icon: layer.icon,
    unlockedBy: sources
      .filter((s) => s.outcome.kind === "unlock" && s.outcome.layer === layer.id)
      .map((s) => s.name),
    lockedBy: sources
      .filter((s) => s.outcome.kind === "lock" && s.outcome.layer === layer.id)
      .map((s) => s.name),
    maps: (layer.maps ?? []).map((id) => map.maps?.find((m) => m.id === id)?.name ?? id),
    sites: map.sites.filter((s) => s.layer === layer.id).map((s) => s.name),
    events: (map.events ?? []).filter((e) => e.layer === layer.id).map((e) => e.name),
    forks: (map.routes ?? []).filter((r) => r.layer === layer.id).map((r) => r.name),
  }))
  const { paths, capped } = enumeratePaths(map)
  return {
    routes,
    layers,
    maps: (map.maps ?? []).map((item) => {
      const definitionId = roadTripItemId(tripMapItemShortId(item.id))
      return {
        id: item.id,
        name: item.name,
        icon: item.icon,
        layers: (map.layers ?? []).filter((l) => l.maps?.includes(item.id)).map((l) => l.name),
        soldAt: map.sites
          .filter((s) => s.shop?.offers?.some((o) => o.definitionId === definitionId))
          .map((s) => s.name),
      }
    }),
    capped,
    paths: paths.map(({ decisions, path }) => {
      const destination = path.map.sites.find((s) => s.role === "destination")
      return {
        label: pathLabel(map, path),
        decisions,
        miles: path.miles,
        driveMinutes: path.map.route.driveMinutes,
        expectedParkMinutes: parkPlan(path.map).expectedMs / 60_000,
        emptyAtMile: fuelPlan(path.map).emptyAtMile,
        ...(destination ? { destination: destination.name } : {}),
      }
    }),
  }
}
