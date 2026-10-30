import {
  MAIN_ROUTE_ID,
  linearize,
  roadTripItemId,
  startView,
  tripMapItemShortId,
  type PathMap,
  type TripMap,
  type TripMapInput,
  type TripOutcome,
} from "@repo/road-trip-map"
import { draftRouteMiles, pinDestination, routeLengthOf } from "./tripMapDraft"

export { routeLengthOf }

/**
 * Draft edits for trip branches (ADR 0222): alternate routes, layers, and the
 * outcomes that tie them together. Pure, like `tripMapDraft`.
 */

export type TripRouteDraft = NonNullable<TripMapInput["routes"]>[number]
export type TripLayerDraft = NonNullable<TripMapInput["layers"]>[number]

function roundMile(mile: number): number {
  return Math.round(mile * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max)
}

export function altRouteOf(draft: TripMapInput, id: string): TripRouteDraft | undefined {
  return draft.routes?.find((route) => route.id === id)
}

export function routeLabel(draft: TripMapInput, routeId: string | undefined): string {
  if (!routeId || routeId === MAIN_ROUTE_ID) return "Main road"
  const route = altRouteOf(draft, routeId)
  return route ? `${route.icon ?? "🛣️"} ${route.name}` : routeId
}

/** Select options for a route field: the main road, then alternates in authored order. */
export function routeOptions(draft: TripMapInput): { id: string; label: string }[] {
  return [
    { id: MAIN_ROUTE_ID, label: "Main road" },
    ...(draft.routes ?? []).map((route) => ({ id: route.id, label: routeLabel(draft, route.id) })),
  ]
}

function uniqueId(taken: Iterable<string>, base: string): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

/** A shortcut off the main road: forks a third of the way, rejoins 8 miles on, 5 minutes long. */
export function addAltRoute(draft: TripMapInput): { draft: TripMapInput; routeId: string } {
  const main = draftRouteMiles(draft)
  const id = uniqueId([MAIN_ROUTE_ID, ...(draft.routes ?? []).map((r) => r.id)], "shortcut")
  const fork = roundMile(main / 3)
  const route: TripRouteDraft = {
    id,
    name: "Shortcut",
    icon: "🛣️",
    driveMinutes: 5,
    from: { mile: fork },
    end: { kind: "rejoin", mile: roundMile(Math.min(main - 0.1, fork + 8)) },
    entry: { kind: "vote", default: "stay" },
  }
  return { draft: { ...draft, routes: [...(draft.routes ?? []), route] }, routeId: id }
}

/** `undefined` in `patch` clears that field. Destinations on the route stay pinned to its end. */
export function updateAltRoute(
  draft: TripMapInput,
  routeId: string,
  patch: Partial<TripRouteDraft>,
): TripMapInput {
  const routes = (draft.routes ?? []).map((route) => {
    if (route.id !== routeId) return route
    const next: Record<string, unknown> = { ...route, ...patch }
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
    return next as TripRouteDraft
  })
  return pinRouteDestinations({ ...draft, routes })
}

function withoutOutcomes(
  outcomes: TripOutcome[] | undefined,
  drop: (outcome: TripOutcome) => boolean,
): TripOutcome[] | undefined {
  const kept = (outcomes ?? []).filter((outcome) => !drop(outcome))
  return kept.length > 0 ? kept : undefined
}

/** Strip outcomes everywhere they're authored (visits, departures, event starts, choice options). */
function mapOutcomes(draft: TripMapInput, drop: (outcome: TripOutcome) => boolean): TripMapInput {
  const sites = draft.sites.map((site) => {
    if (!site.onVisit && !site.onDepart) return site
    const { onVisit, onDepart, ...rest } = site
    const visit = withoutOutcomes(onVisit as TripOutcome[] | undefined, drop)
    const depart = withoutOutcomes(onDepart as TripOutcome[] | undefined, drop)
    return {
      ...rest,
      ...(visit ? { onVisit: visit } : {}),
      ...(depart ? { onDepart: depart } : {}),
    }
  })
  const events = draft.events?.map((event) => {
    const { outcomes, ...rest } = event
    const kept = withoutOutcomes(outcomes as TripOutcome[] | undefined, drop)
    const resolution = rest.resolution?.map((entry) =>
      entry.kind === "choice"
        ? {
            ...entry,
            options: entry.options.map((option) => ({
              ...option,
              outcomes: (option.outcomes ?? []).filter((o) => !drop(o as TripOutcome)),
            })),
          }
        : entry,
    )
    return {
      ...rest,
      ...(resolution ? { resolution } : {}),
      ...(kept ? { outcomes: kept } : {}),
    }
  })
  return { ...draft, sites, ...(events ? { events } : {}) }
}

/** Remove a route, its content, routes forking off it, and diverts to it. */
export function removeAltRoute(draft: TripMapInput, routeId: string): TripMapInput {
  const doomed = new Set([routeId])
  // Routes that fork off or rejoin a removed route go too.
  for (let changed = true; changed; ) {
    changed = false
    for (const route of draft.routes ?? []) {
      if (doomed.has(route.id)) continue
      const parent = route.from.route ?? MAIN_ROUTE_ID
      const target = route.end.kind === "rejoin" ? (route.end.route ?? parent) : undefined
      if (doomed.has(parent) || (target && doomed.has(target))) {
        doomed.add(route.id)
        changed = true
      }
    }
  }
  const routes = (draft.routes ?? []).filter((route) => !doomed.has(route.id))
  const pruned = mapOutcomes(
    {
      ...draft,
      sites: draft.sites.filter((site) => !site.route || !doomed.has(site.route)),
      ...(draft.events
        ? { events: draft.events.filter((event) => !event.route || !doomed.has(event.route)) }
        : {}),
    },
    (outcome) => outcome.kind === "divert" && doomed.has(outcome.route),
  )
  const { routes: _drop, ...rest } = pruned
  return routes.length > 0 ? { ...rest, routes } : rest
}

/** Drag a fork along its parent route. */
export function moveRouteFork(draft: TripMapInput, routeId: string, mile: number): TripMapInput {
  const route = altRouteOf(draft, routeId)
  if (!route) return draft
  const parentLength = routeLengthOf(draft, route.from.route)
  return updateAltRoute(draft, routeId, {
    from: { ...route.from, mile: roundMile(clamp(mile, 0, parentLength - 0.1)) },
  })
}

/** Drag a rejoin along its target route. */
export function moveRouteEnd(draft: TripMapInput, routeId: string, mile: number): TripMapInput {
  const route = altRouteOf(draft, routeId)
  if (!route || route.end.kind !== "rejoin") return draft
  const target = route.end.route ?? route.from.route
  const length = routeLengthOf(draft, target)
  return updateAltRoute(draft, routeId, {
    end: { ...route.end, mile: roundMile(clamp(mile, 0, length - 0.1)) },
  })
}

/** Destinations on an alternate route stay at its end, like the main road's. */
export function pinRouteDestinations(draft: TripMapInput): TripMapInput {
  const pinned = pinDestination(draft)
  return {
    ...pinned,
    sites: pinned.sites.map((site) =>
      site.role === "destination" && site.route && site.route !== MAIN_ROUTE_ID
        ? { ...site, mile: roundMile(routeLengthOf(pinned, site.route)) }
        : site,
    ),
  }
}

export function addLayer(draft: TripMapInput): { draft: TripMapInput; layerId: string } {
  const id = uniqueId(
    (draft.layers ?? []).map((l) => l.id),
    "local-tips",
  )
  const layer: TripLayerDraft = { id, name: "Local tips", icon: "🗺️" }
  return { draft: { ...draft, layers: [...(draft.layers ?? []), layer] }, layerId: id }
}

export function updateLayer(
  draft: TripMapInput,
  layerId: string,
  patch: Partial<TripLayerDraft>,
): TripMapInput {
  return {
    ...draft,
    layers: (draft.layers ?? []).map((layer) => {
      if (layer.id !== layerId) return layer
      const next: Record<string, unknown> = { ...layer, ...patch }
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
      return next as TripLayerDraft
    }),
  }
}

/** Remove a layer: its content stays (on the road for everyone), its unlocks and locks go. */
export function removeLayer(draft: TripMapInput, layerId: string): TripMapInput {
  const clear = <T extends { layer?: string }>(item: T): T => {
    if (item.layer !== layerId) return item
    const { layer: _drop, ...rest } = item
    return rest as T
  }
  const pruned = mapOutcomes(
    {
      ...draft,
      sites: draft.sites.map(clear),
      ...(draft.events ? { events: draft.events.map(clear) } : {}),
      ...(draft.routes ? { routes: draft.routes.map(clear) } : {}),
    },
    (outcome) =>
      (outcome.kind === "unlock" || outcome.kind === "lock") && outcome.layer === layerId,
  )
  const layers = (draft.layers ?? []).filter((layer) => layer.id !== layerId)
  const { layers: _drop, ...rest } = pruned
  return layers.length > 0 ? { ...rest, layers } : rest
}

export type TripMapItemDraft = NonNullable<TripMapInput["maps"]>[number]

/** A map the trip can sell (ADR 0227). Layers opt into it from their inspector. */
export function addTripMap(draft: TripMapInput): { draft: TripMapInput; mapId: string } {
  const id = uniqueId(
    (draft.maps ?? []).map((m) => m.id),
    "local-map",
  )
  const item: TripMapItemDraft = { id, name: "Local map", icon: "🗺️", coinValue: 25 }
  return { draft: { ...draft, maps: [...(draft.maps ?? []), item] }, mapId: id }
}

export function updateTripMap(
  draft: TripMapInput,
  mapId: string,
  patch: Partial<TripMapItemDraft>,
): TripMapInput {
  return {
    ...draft,
    maps: (draft.maps ?? []).map((item) => {
      if (item.id !== mapId) return item
      const next: Record<string, unknown> = { ...item, ...patch }
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
      return next as TripMapItemDraft
    }),
  }
}

/** Remove a map: layers stop opting into it and sites stop selling it. */
export function removeTripMap(draft: TripMapInput, mapId: string): TripMapInput {
  const definitionId = roadTripItemId(tripMapItemShortId(mapId))
  const maps = (draft.maps ?? []).filter((item) => item.id !== mapId)
  const layers = draft.layers?.map((layer) => {
    if (!layer.maps?.includes(mapId)) return layer
    const rest = layer.maps.filter((id) => id !== mapId)
    const { maps: _drop, ...without } = layer
    return rest.length > 0 ? { ...without, maps: rest } : without
  })
  const sites = draft.sites.map((site) => {
    const offers = site.shop?.offers
    if (!offers?.some((offer) => offer.definitionId === definitionId)) return site
    return {
      ...site,
      shop: { ...site.shop, offers: offers.filter((offer) => offer.definitionId !== definitionId) },
    }
  })
  const { maps: _maps, ...rest } = draft
  return {
    ...rest,
    sites,
    ...(layers ? { layers } : {}),
    ...(maps.length > 0 ? { maps } : {}),
  }
}

const MAX_DRIVE_MINUTES = 24 * 60

export type ScaleTripDriveResult = { ok: true; draft: TripMapInput } | { ok: false; error: string }

/**
 * Set the main road's drive time and keep everything at the same fraction of
 * its road: site and event miles, alternate lengths, forks, and rejoins scale
 * by one factor. Stop lengths, event durations, and poll leads don't change.
 */
export function scaleTripDrive(draft: TripMapInput, driveMinutes: number): ScaleTripDriveResult {
  if (!Number.isFinite(driveMinutes) || driveMinutes <= 0 || driveMinutes > MAX_DRIVE_MINUTES) {
    return { ok: false, error: "Drive time must be more than 0 and at most 24 hours." }
  }
  const factor = driveMinutes / draft.route.driveMinutes
  const routes = draft.routes?.map((route) => ({
    ...route,
    driveMinutes: Math.max(0.01, Math.round(route.driveMinutes * factor * 100) / 100),
    from: { ...route.from, mile: route.from.mile * factor },
    end: route.end.kind === "rejoin" ? { ...route.end, mile: route.end.mile * factor } : route.end,
  }))
  const tooLong = routes?.find((route) => route.driveMinutes > MAX_DRIVE_MINUTES)
  if (tooLong) return { ok: false, error: `${tooLong.name} would drive longer than 24 hours.` }

  const resized: TripMapInput = {
    ...draft,
    route: { ...draft.route, driveMinutes },
    ...(routes ? { routes } : {}),
  }
  const lengthOf = (routeId: string | undefined) => routeLengthOf(resized, routeId)
  const scaled: TripMapInput = {
    ...resized,
    ...(routes
      ? {
          routes: routes.map((route) => ({
            ...route,
            from: {
              ...route.from,
              mile: roundMile(clamp(route.from.mile, 0, lengthOf(route.from.route) - 0.1)),
            },
            end:
              route.end.kind === "rejoin"
                ? {
                    ...route.end,
                    mile: roundMile(
                      clamp(route.end.mile, 0, lengthOf(route.end.route ?? route.from.route) - 0.1),
                    ),
                  }
                : route.end,
          })),
        }
      : {}),
    sites: draft.sites.map((site) => {
      const end = lengthOf(site.route)
      return { ...site, mile: roundMile(clamp(site.mile * factor, 0.1, end - 0.1)) }
    }),
    ...(draft.events
      ? {
          events: draft.events.map((event) =>
            event.mile === undefined
              ? event
              : {
                  ...event,
                  mile: roundMile(clamp(event.mile * factor, 0, lengthOf(event.route))),
                },
          ),
        }
      : {}),
  }
  return { ok: true, draft: pinRouteDestinations(scaled) }
}

/** The main road with nothing unlocked or decided: what projections assume when nobody votes. */
export function mainPath(map: TripMap): PathMap {
  return linearize(map, startView()).map
}

export type TrackRow = {
  route: string
  /** Shared-scale miles where the row starts (the fork, for an alternate). */
  x: number
  length: number
  /** Fork: the parent row and mile. End: the rejoin row and mile, or a destination flag. */
  fork?: { route: string; mile: number }
  end?: { route: string; mile: number } | { destination: true }
}

/**
 * Rows for the route track on one mile scale: the main road from 0, then each
 * alternate starting at x(its fork). Parents come before children.
 */
export function trackLayout(draft: TripMapInput): { rows: TrackRow[]; scale: number } {
  const rows: TrackRow[] = [{ route: MAIN_ROUTE_ID, x: 0, length: draftRouteMiles(draft) }]
  const pending = [...(draft.routes ?? [])]
  for (let guard = 0; pending.length > 0 && guard < 64; guard++) {
    const route = pending.shift()!
    const parent = rows.find((row) => row.route === (route.from.route ?? MAIN_ROUTE_ID))
    if (!parent) {
      // Its parent hasn't been laid out yet, or doesn't exist: retry once the others are placed.
      if (pending.some((r) => r.id === (route.from.route ?? MAIN_ROUTE_ID))) pending.push(route)
      continue
    }
    rows.push({
      route: route.id,
      x: parent.x + route.from.mile,
      length: routeLengthOf(draft, route.id),
      fork: { route: parent.route, mile: route.from.mile },
      end:
        route.end.kind === "rejoin"
          ? { route: route.end.route ?? parent.route, mile: route.end.mile }
          : { destination: true },
    })
  }
  const scale = Math.max(1, ...rows.map((row) => row.x + row.length))
  return { rows, scale }
}
