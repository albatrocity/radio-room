import {
  MIN_SITE_SPACING_MILES,
  ROUTE_END_TOLERANCE_MILES,
  fuelPlan,
  isDestination,
  parkPlan,
  resolveSiteSettings,
  resolveTripTuning,
  routeMiles,
  siteShopRequest,
  sortedSites,
  type SiteShopRequest,
} from "./derive"
import {
  PHYSICAL_MEDIA_FORMATS,
  formatPhysicalMediaList,
  type PhysicalMediaFormat,
  type PhysicalMediaStock,
} from "@repo/types"
import { outcomeSources } from "./flowOutline"
import { eventTrigger, nearestMechanicAhead } from "./incidents"
import {
  altRoute,
  enumeratePaths,
  forkParent,
  pathLabel,
  rejoinRoute,
  routeLength,
  siteRoute,
} from "./paths"
import { MAIN_ROUTE_ID, type TripMap } from "./schema"
import { tripGuideItem, vanConsumable } from "./van"

export type TripMapIssueSeverity = "error" | "warning"

export type TripMapIssue = {
  severity: TripMapIssueSeverity
  code: string
  message: string
  /** JSON-ish path for editor highlighting, e.g. `sites.2.mile`. */
  path?: string
  siteId?: string
}

export type ShopValidationResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; errors: string[] }

export type LintTripMapDeps = {
  /** Validate one site's offers and record bin (Item Shops `shopAccess.validateShop`). */
  validateShop?: (req: SiteShopRequest) => ShopValidationResult
  /** Planned departure time (ms) for the deadline check. */
  departAt?: number
  /** Asset CDN origin that published site art should live under. */
  assetBaseUrl?: string
}

export const DEFAULT_ASSET_CDN_BASE_URL = "https://cdn.listeningroom.club"

/** Key prefix Game Studio publishes site images and GLBs under (content-addressed). */
export const SITE_ASSET_KEY_PREFIX = "assets/maps/sites/"

/**
 * Trip map lint (M5). Errors block loading and departure; warnings are shown to the host and
 * designer only.
 */
export function lintTripMap(map: TripMap, deps: LintTripMapDeps = {}): TripMapIssue[] {
  const issues: TripMapIssue[] = []
  const miles = routeMiles(map.route)
  const routeIds = new Set([MAIN_ROUTE_ID, ...(map.routes ?? []).map((route) => route.id)])
  const lengthOf = (route: string) => (routeIds.has(route) ? routeLength(map, route) : miles)

  const destinations = map.sites.filter(
    (site) => isDestination(site) && siteRoute(site) === MAIN_ROUTE_ID,
  )
  if (destinations.length === 0) {
    issues.push({
      severity: "error",
      code: "no-destination",
      message: 'The map needs one site with role "destination" at the end of the route.',
      path: "sites",
    })
  } else if (destinations.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple-destinations",
      message: "Only one site can be the destination.",
      path: "sites",
    })
  }
  for (const destination of destinations) {
    if (Math.abs(destination.mile - miles) > ROUTE_END_TOLERANCE_MILES) {
      issues.push({
        severity: "error",
        code: "destination-not-at-end",
        message: `The destination is at mile ${fmt(destination.mile)} but the route is ${fmt(miles)} miles (drive minutes × base mph).`,
        path: `sites.${map.sites.indexOf(destination)}.mile`,
        siteId: destination.id,
      })
    }
  }

  const assetOrigin = `${(deps.assetBaseUrl ?? DEFAULT_ASSET_CDN_BASE_URL).replace(/\/+$/, "")}/`
  const seen = new Set<string>()
  const vanFormats = resolveTripTuning(map).vanPlayback.formats
  map.sites.forEach((site, index) => {
    const assets = [
      { label: "image", url: site.imageUrl, path: `sites.${index}.imageUrl` },
      { label: "3D model", url: site.model?.url, path: `sites.${index}.model.url` },
    ]
    for (const asset of assets) {
      if (asset.url && !asset.url.startsWith(assetOrigin)) {
        issues.push({
          severity: "warning",
          code: "non-cdn-asset",
          message: `${site.name}'s ${asset.label} isn't on the asset CDN; publish it from Game Studio so it can't move or vanish.`,
          path: asset.path,
          siteId: site.id,
        })
      }
    }

    if (seen.has(site.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-site-id",
        message: `Site id "${site.id}" is used more than once.`,
        path: `sites.${index}.id`,
        siteId: site.id,
      })
    }
    seen.add(site.id)

    const siteMiles = lengthOf(siteRoute(site))
    if (site.mile > siteMiles + ROUTE_END_TOLERANCE_MILES) {
      issues.push({
        severity: "error",
        code: "site-beyond-route",
        message: `${site.name} is at mile ${fmt(site.mile)}, past the end of its route (${fmt(siteMiles)}).`,
        path: `sites.${index}.mile`,
        siteId: site.id,
      })
    }

    const settings = resolveSiteSettings(map, site)
    if (settings.optional) {
      const leadMiles = (map.route.baseMph * settings.pollLeadMs) / 3_600_000
      if (siteRoute(site) === MAIN_ROUTE_ID && site.mile < leadMiles) {
        issues.push({
          severity: "warning",
          code: "poll-before-departure",
          message: `${site.name}'s skip poll would open before departure; it will use its default (${settings.skipDefault}).`,
          path: `sites.${index}.mile`,
          siteId: site.id,
        })
      }
      if (settings.pollDurationMs > settings.pollLeadMs) {
        issues.push({
          severity: "warning",
          code: "poll-longer-than-lead",
          message: `${site.name}'s skip poll lasts longer than its lead; it will close early at the exit.`,
          path: `sites.${index}.skipPoll`,
          siteId: site.id,
        })
      }
      if (
        settings.mystery &&
        site.skipPoll?.question &&
        site.skipPoll.question.toLowerCase().includes(site.name.toLowerCase())
      ) {
        issues.push({
          severity: "warning",
          code: "mystery-names-site",
          message: `${site.name} is a mystery poll but its question names the site.`,
          path: `sites.${index}.skipPoll.question`,
          siteId: site.id,
        })
      }
    } else if (site.skipPoll && !isDestination(site)) {
      issues.push({
        severity: "warning",
        code: "skip-poll-on-mandatory",
        message: `${site.name} is mandatory, so its skip-poll settings are ignored.`,
        path: `sites.${index}.skipPoll`,
        siteId: site.id,
      })
    }

    const offers = site.shop?.offers ?? []
    const shopRequest = siteShopRequest(site)
    if (shopRequest && deps.validateShop) {
      const result = deps.validateShop(shopRequest)
      if (!result.ok) {
        for (const error of result.errors) {
          issues.push({
            severity: "error",
            code: "unknown-item",
            message: `${site.name}: ${error}`,
            path: `sites.${index}.shop.offers`,
            siteId: site.id,
          })
        }
      } else {
        for (const warning of result.warnings ?? []) {
          issues.push({
            severity: "warning",
            code: "shop-availability",
            message: `${site.name}: ${warning}`,
            path: `sites.${index}.shop`,
            siteId: site.id,
          })
        }
      }
    }
    if (isDestination(site) && site.services?.gas) {
      issues.push({
        severity: "warning",
        code: "gas-at-destination",
        message: `${site.name} is the destination, so its gas service is ignored.`,
        path: `sites.${index}.services.gas`,
        siteId: site.id,
      })
    }
    if ((site.shop || site.services?.physicalMedia) && !shopRequest) {
      issues.push({
        severity: "warning",
        code: "empty-shop",
        message: `${site.name} has a shop with no offers and sells no records; no shop will open there.`,
        path: `sites.${index}.shop`,
        siteId: site.id,
      })
    }
    const sold = soldFormats(site.services?.physicalMedia)
    if (sold.length > 0) {
      const unplayable = sold.filter((format) => !vanFormats.includes(format))
      if (unplayable.length > 0) {
        issues.push({
          severity: "warning",
          code: "van-cannot-play",
          message: `${site.name} sells ${formatPhysicalMediaList(unplayable)} the van can't play; travelers need their own player.`,
          path: `sites.${index}.services.physicalMedia`,
          siteId: site.id,
        })
      }
    }
    if (site.shop?.sample && offers.length === 0) {
      issues.push({
        severity: "error",
        code: "sample-without-offers",
        message: `${site.name} samples a shop with no offers.`,
        path: `sites.${index}.shop.sample`,
        siteId: site.id,
      })
    } else if (site.shop?.sample && site.shop.sample.count > offers.length) {
      issues.push({
        severity: "warning",
        code: "sample-larger-than-pool",
        message: `${site.name}: everyone sees the whole pool.`,
        path: `sites.${index}.shop.sample.count`,
        siteId: site.id,
      })
    }
    if (isDestination(site) && site.services?.mechanic) {
      issues.push({
        severity: "warning",
        code: "mechanic-at-destination",
        message: `${site.name} is the destination, so Engine Failure never tows there.`,
        path: `sites.${index}.services.mechanic`,
        siteId: site.id,
      })
    }
  })

  const destinationMile = destinations[0]?.mile ?? miles
  issues.push(
    ...lintEvents(map, (route) => (route === MAIN_ROUTE_ID ? destinationMile : lengthOf(route))),
  )

  const ordered = sortedSites(map)
  const byRoute = (sites: typeof ordered) =>
    Array.from(routeIds).map((route) => sites.filter((site) => siteRoute(site) === route))
  for (const onRoute of byRoute(ordered))
  for (let i = 1; i < onRoute.length; i++) {
    const prev = onRoute[i - 1]!
    const site = onRoute[i]!
    // Tolerance so authored miles like 4 and 4.1 aren't rejected by float error.
    if (site.mile - prev.mile < MIN_SITE_SPACING_MILES - 1e-9) {
      issues.push({
        severity: "error",
        code: "sites-overlap",
        message: `${prev.name} and ${site.name} are less than ${MIN_SITE_SPACING_MILES} mi apart. Space sites out so the van reaches them one at a time.`,
        path: `sites.${map.sites.indexOf(site)}.mile`,
        siteId: site.id,
      })
    }
  }

  const optional = sortedSites(map).filter((s) => resolveSiteSettings(map, s).optional)
  for (const optionalSites of byRoute(optional))
  for (let i = 1; i < optionalSites.length; i++) {
    const prev = optionalSites[i - 1]!
    const site = optionalSites[i]!
    const leadMiles = (map.route.baseMph * resolveSiteSettings(map, site).pollLeadMs) / 3_600_000
    if (site.mile - prev.mile < leadMiles) {
      issues.push({
        severity: "warning",
        code: "exits-too-close",
        message: `${prev.name} and ${site.name} are closer than the skip-poll lead; their polls may overlap and one may fall back to its default.`,
        path: `sites.${map.sites.indexOf(site)}.mile`,
        siteId: site.id,
      })
    }
  }

  // Fuel and deadline run over every path through the forks (ADR 0222).
  const { paths, capped } = enumeratePaths(map)
  if (capped) {
    issues.push({
      severity: "warning",
      code: "too-many-paths",
      message: "Too many fork combinations to check every path; fuel and deadline checks cover the main road only.",
      path: "routes",
    })
  }
  const branching = paths.length > 1 || (map.routes?.length ?? 0) > 0
  for (const { path } of paths) {
    const label = branching ? ` (${pathLabel(map, path)})` : ""
    const fuel = fuelPlan(path.map)
    if (fuel.emptyAtMile !== null) {
      issues.push({
        severity: "warning",
        code: "gas-desert",
        message: `The tank runs dry around mile ${fmt(fuel.emptyAtMile)}${label} with no gas stop the van takes if nobody votes. Add a gas site before then, or lower tanks per trip.`,
        path: "route.tanksPerTrip",
      })
    }
    if (map.route.deadlineAt && deps.departAt !== undefined) {
      const deadline = Date.parse(map.route.deadlineAt)
      const earliest =
        deps.departAt + path.map.route.driveMinutes * 60_000 + parkPlan(path.map).mandatoryMs
      if (earliest > deadline) {
        issues.push({
          severity: "warning",
          code: "deadline-unreachable",
          message: `The destination can't be reached before the deadline${label} even without optional stops.`,
          path: "route.deadlineAt",
        })
      }
    }
  }

  issues.push(...lintBranches(map, paths.map((p) => p.path), capped))
  return issues
}

/** Layers, routes, outcomes, and choices (ADR 0222). */
function lintBranches(
  map: TripMap,
  paths: ReturnType<typeof enumeratePaths>["paths"][number]["path"][],
  capped: boolean,
): TripMapIssue[] {
  const issues: TripMapIssue[] = []
  const error = (code: string, message: string, path: string) =>
    issues.push({ severity: "error", code, message, path })
  const warn = (code: string, message: string, path: string) =>
    issues.push({ severity: "warning", code, message, path })
  const routes = map.routes ?? []
  const layers = map.layers ?? []
  const routeIds = new Set([MAIN_ROUTE_ID, ...routes.map((route) => route.id)])
  const layerIds = new Set(layers.map((layer) => layer.id))
  const seenRoutes = new Set<string>()
  const seenLayers = new Set<string>()

  layers.forEach((layer, index) => {
    if (seenLayers.has(layer.id)) error("duplicate-layer-id", `Layer id "${layer.id}" is used more than once.`, `layers.${index}.id`)
    seenLayers.add(layer.id)
    for (const item of layer.unlockItems ?? []) {
      if (tripGuideItem(item)?.effect !== "unlock-layer") {
        error("unknown-unlock-item", `${layer.name}: "${item}" isn't an item that unlocks layers.`, `layers.${index}.unlockItems`)
      }
    }
  })

  routes.forEach((route, index) => {
    const path = `routes.${index}`
    if (seenRoutes.has(route.id)) error("duplicate-route-id", `Route id "${route.id}" is used more than once.`, `${path}.id`)
    seenRoutes.add(route.id)
    const parent = forkParent(route)
    if (!routeIds.has(parent)) {
      error("unknown-route", `${route.name} forks off "${parent}", which isn't a route.`, `${path}.from.route`)
    } else if (route.from.mile > routeLength(map, parent) + ROUTE_END_TOLERANCE_MILES) {
      error("fork-beyond-route", `${route.name} forks at mile ${fmt(route.from.mile)}, past the end of its parent.`, `${path}.from.mile`)
    }
    if (route.layer && !layerIds.has(route.layer)) {
      error("unknown-layer", `${route.name}'s fork names layer "${route.layer}", which doesn't exist.`, `${path}.layer`)
    }
    const destinations = map.sites.filter((s) => siteRoute(s) === route.id && isDestination(s))
    if (route.end.kind === "rejoin") {
      const target = rejoinRoute(route)!
      if (!routeIds.has(target)) {
        error("unknown-route", `${route.name} rejoins "${target}", which isn't a route.`, `${path}.end.route`)
      } else if (route.end.mile > routeLength(map, target) + ROUTE_END_TOLERANCE_MILES) {
        error("rejoin-beyond-route", `${route.name} rejoins at mile ${fmt(route.end.mile)}, past the end of its target.`, `${path}.end.mile`)
      }
      if (target === parent && route.end.mile < route.from.mile - 1e-9) {
        error("rejoin-before-fork", `${route.name} rejoins before its fork, which would loop the van.`, `${path}.end.mile`)
      }
      if (destinations.length > 0) {
        error("rejoin-with-destination", `${route.name} rejoins another road, so it can't hold a destination.`, `${path}.end`)
      }
    } else {
      if (destinations.length !== 1) {
        error(
          destinations.length === 0 ? "route-without-destination" : "multiple-destinations",
          `${route.name} ends at its own destination, so it needs exactly one destination site.`,
          `${path}.end`,
        )
      }
      for (const destination of destinations) {
        const length = routeLength(map, route.id)
        if (Math.abs(destination.mile - length) > ROUTE_END_TOLERANCE_MILES) {
          error("destination-not-at-end", `${destination.name} is at mile ${fmt(destination.mile)} but ${route.name} is ${fmt(length)} miles.`, `sites.${map.sites.indexOf(destination)}.mile`)
        }
      }
    }
    if (route.entry.kind === "outcome" && !outcomeSources(map).some((s) => s.outcome.kind === "divert" && s.outcome.route === route.id)) {
      warn("route-never-taken", `Nothing diverts to ${route.name}, so the van never takes it.`, `${path}.entry`)
    }
    if (route.end.kind === "rejoin" && rejoinRoute(route) === parent) {
      for (const site of map.sites) {
        if (siteRoute(site) !== parent || isDestination(site)) continue
        if (site.mile > route.from.mile && site.mile < route.end.mile && !resolveSiteSettings(map, site).optional) {
          warn("mandatory-bypassable", `${route.name} bypasses ${site.name}, which is mandatory.`, `sites.${map.sites.indexOf(site)}`)
        }
      }
    }
  })

  // Route and layer references on content.
  const content = [
    ...map.sites.map((item, index) => ({ item, path: `sites.${index}`, name: item.name })),
    ...(map.events ?? []).map((item, index) => ({ item, path: `events.${index}`, name: item.name })),
  ]
  for (const { item, path, name } of content) {
    if (item.route && !routeIds.has(item.route)) {
      error("unknown-route", `${name} is on route "${item.route}", which doesn't exist.`, `${path}.route`)
    }
    if (item.layer && !layerIds.has(item.layer)) {
      error("unknown-layer", `${name} is in layer "${item.layer}", which doesn't exist.`, `${path}.layer`)
    }
  }

  // Outcomes: references, and diverts need a fork ahead of their source.
  for (const { outcome, path, name, route, mile } of outcomeSources(map)) {
    if ((outcome.kind === "unlock" || outcome.kind === "lock") && !layerIds.has(outcome.layer)) {
      error("unknown-layer", `${name} ${outcome.kind}s layer "${outcome.layer}", which doesn't exist.`, path)
    }
    if (outcome.kind === "divert") {
      const target = altRoute(map, outcome.route)
      if (!target) {
        error("unknown-route", `${name} diverts to "${outcome.route}", which isn't a route.`, path)
      } else if (route !== undefined && mile !== undefined && forkParent(target) === route && target.from.mile < mile) {
        error("divert-behind", `${name} diverts to ${target.name}, but its fork is behind it.`, path)
      }
    }
  }

  // Choices.
  ;(map.events ?? []).forEach((event, index) => {
    const choices = (event.resolution ?? []).flatMap((entry, i) => (entry.kind === "choice" ? [{ entry, i }] : []))
    for (const { entry, i } of choices) {
      if (!entry.options.some((option) => option.id === entry.default)) {
        error("choice-default", `${event.name}: the choice's default isn't one of its options.`, `events.${index}.resolution.${i}.default`)
      }
      const ids = new Set(entry.options.map((o) => o.id))
      if (ids.size !== entry.options.length) {
        error("choice-duplicate-option", `${event.name}: two choice options share an id.`, `events.${index}.resolution.${i}.options`)
      }
    }
    if (event.effect?.kind === "slow" && choices.length > 1) {
      error("slow-multiple-choices", `${event.name} slows the van, so it can host only one choice.`, `events.${index}.resolution`)
    }
  })

  // Layers nothing unlocks.
  const unlocked = new Set(
    outcomeSources(map).flatMap((s) => (s.outcome.kind === "unlock" ? [s.outcome.layer] : [])),
  )
  layers.forEach((layer, index) => {
    if (!unlocked.has(layer.id) && !(layer.unlockItems?.length)) {
      warn("layer-never-unlocked", `Nothing unlocks ${layer.name}, so its stops never appear.`, `layers.${index}`)
    }
  })

  // A path that revisits a stretch of road loops (only checkable under the cap).
  if (!capped) {
    for (const path of paths) {
      const seen: { route: string; from: number; to: number }[] = []
      const loops = path.segments.some((segment) => {
        const hit = seen.some(
          (s) => s.route === segment.route && segment.fromMile < s.to - 1e-9 && s.from < segment.toMile - 1e-9,
        )
        seen.push({ route: segment.route, from: segment.fromMile, to: segment.toMile })
        return hit
      })
      if (loops) {
        error("route-cycle", `The roads loop: ${pathLabel(map, path)} drives the same stretch twice.`, "routes")
        break
      }
    }
  }
  return issues
}

export function hasLintErrors(issues: TripMapIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error")
}

/** Trip event rules (ADR 0220). `endOf`: where an event's route ends (main: the destination). */
function lintEvents(map: TripMap, endOf: (route: string) => number): TripMapIssue[] {
  // Mechanic lookups on main read main alone (sites on other routes sit at their own miles).
  const mainOnly: TripMap = { ...map, sites: map.sites.filter((s) => siteRoute(s) === MAIN_ROUTE_ID) }
  const issues: TripMapIssue[] = []
  const events = map.events ?? []
  const eventIds = new Set<string>()
  let fuelEvents = 0
  events.forEach((event, index) => {
    const path = `events.${index}`
    const error = (code: string, message: string, at = path) =>
      issues.push({ severity: "error", code, message, path: at })
    const label = event.name
    if (eventIds.has(event.id)) {
      error("duplicate-event-id", `Event id "${event.id}" is used more than once.`, `${path}.id`)
    }
    eventIds.add(event.id)

    const chain = event.resolution ?? []
    if (event.effect?.kind === "slow" && event.durationMinutes === undefined) {
      error("slow-without-duration", `${label} slows the van but has no duration.`, `${path}.durationMinutes`)
    }
    if (event.effect?.kind === "stop" && chain.length === 0) {
      error("stop-without-resolution", `${label} stops the van but nothing resolves it.`, `${path}.resolution`)
    }
    chain.forEach((entry, entryIndex) => {
      if (entry.kind !== "item") return
      for (const item of entry.items ?? []) {
        if (!vanConsumable(item)) {
          error(
            "unknown-event-item",
            `${label}: "${item}" isn't a road-trip consumable, so it can't end the event.`,
            `${path}.resolution.${entryIndex}.items`,
          )
        }
      }
    })
    ;(event.beats ?? []).forEach((beat, beatIndex) => {
      if (beat.atMinutes <= 0) {
        error(
          "beat-not-after-start",
          `${label}: timed narratives must come after the event starts. Put opening copy in its narrative.`,
          `${path}.beats.${beatIndex}.atMinutes`,
        )
      }
    })

    if (eventTrigger(event) === "fuel") {
      fuelEvents++
      if (event.mile !== undefined) {
        error("fuel-event-with-mile", `${label} follows an empty tank, so it can't also have a mile.`, `${path}.mile`)
      }
      if (event.effect?.kind !== "stop" || !chain.some((entry) => entry.kind === "refuel")) {
        error(
          "fuel-event-without-refuel",
          `${label} follows an empty tank, so it must stop the van and refuel it.`,
          `${path}.resolution`,
        )
      }
      return
    }

    if (event.mile === undefined) {
      error("event-missing-mile", `${label} has no mile, so it never fires.`, `${path}.mile`)
      return
    }
    if (event.mile >= endOf(siteRoute(event))) {
      error(
        "event-beyond-route",
        `${label} at mile ${fmt(event.mile)} is at or past the end of its route, so it never fires.`,
        `${path}.mile`,
      )
      return
    }
    if (
      siteRoute(event) === MAIN_ROUTE_ID &&
      event.effect?.kind === "stop" &&
      chain.some((entry) => entry.kind === "tow") &&
      !nearestMechanicAhead(mainOnly, event.mile)
    ) {
      issues.push({
        severity: "warning",
        code: "no-mechanic",
        message: `${label} at mile ${fmt(event.mile)} has no Mechanic ahead; a mobile mechanic repairs it on the shoulder.`,
        path: `${path}.mile`,
      })
    }
  })
  if (fuelEvents > 1) {
    issues.push({
      severity: "error",
      code: "multiple-fuel-events",
      message: "Only one event can follow an empty tank.",
      path: "events",
    })
  }
  return issues
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Formats a bin can sell: the library filter's (every format when unset) plus
 * each pick's chosen format. A pick without one is inferred in the room, so
 * it could be any format.
 */
function soldFormats(stock: PhysicalMediaStock | undefined): PhysicalMediaFormat[] {
  if (!stock) return []
  const sold = new Set<PhysicalMediaFormat>()
  if (stock.library) {
    for (const format of stock.library.formats?.length ? stock.library.formats : PHYSICAL_MEDIA_FORMATS) {
      sold.add(format)
    }
  }
  for (const pick of stock.picks ?? []) {
    if (pick.format) sold.add(pick.format)
  }
  return PHYSICAL_MEDIA_FORMATS.filter((format) => sold.has(format))
}
