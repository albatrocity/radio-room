import type { SkipDefault, TripMap, TripSite } from "./schema"

/** Destination mile tolerance when comparing against the derived route length. */
export const ROUTE_END_TOLERANCE_MILES = 0.05

/** Closest two sites may be. Arrivals resolve one site at a time, so overlapping pins are a map error. */
export const MIN_SITE_SPACING_MILES = 0.1

/** Route length in miles, derived from authored drive minutes and base speed (D6). */
export function routeMiles(route: TripMap["route"]): number {
  return (route.baseMph * route.driveMinutes) / 60
}

export function isDestination(site: Pick<TripSite, "role">): boolean {
  return site.role === "destination"
}

/** Optional sites get a skip poll; the destination is always mandatory (D10). */
export function isOptionalSite(site: Pick<TripSite, "role" | "mandatory">): boolean {
  return !isDestination(site) && site.mandatory !== true
}

export function isMysterySite(site: TripSite): boolean {
  return isOptionalSite(site) && site.skipPoll?.mystery === true
}

export type ResolvedSiteSettings = {
  optional: boolean
  mystery: boolean
  /** Miles before the site at which it reveals; `Infinity` = from departure, `0` = on arrival. */
  revealMiles: number
  /** Skip-poll lead in milliseconds of drive time before the exit (optional sites only). */
  pollLeadMs: number
  pollDurationMs: number
  skipDefault: SkipDefault
  parkMs: number
}

/** Apply map tuning defaults to one site. Mystery sites default to reveal on arrival. */
export function resolveSiteSettings(map: TripMap, site: TripSite): ResolvedSiteSettings {
  const optional = isOptionalSite(site)
  const mystery = isMysterySite(site)
  const rawReveal = site.revealMiles ?? (mystery ? 0 : map.tuning.revealMiles)
  return {
    optional,
    mystery,
    revealMiles: rawReveal === "always" ? Number.POSITIVE_INFINITY : rawReveal,
    pollLeadMs: (site.skipPoll?.leadMinutes ?? map.tuning.skipPoll.leadMinutes) * 60_000,
    pollDurationMs: map.tuning.skipPoll.durationSec * 1000,
    skipDefault: site.skipPoll?.default ?? map.tuning.skipPoll.default,
    parkMs: (site.parkMinutes ?? map.tuning.parkMinutes) * 60_000,
  }
}

// ---------------------------------------------------------------------------
// Fuel (M2): miles and mpg derive from drive minutes and tanks per trip (D6)
// ---------------------------------------------------------------------------

/** Base burn in gallons per mile: the route uses `tanksPerTrip` full tanks. */
export function baseGallonsPerMile(map: TripMap): number {
  const miles = routeMiles(map.route)
  return miles > 0 ? (map.route.tanksPerTrip * map.tuning.tankGallons) / miles : 0
}

export function isGasSite(site: TripSite): boolean {
  return site.services?.gas !== undefined && !isDestination(site)
}

export function isLowFuel(map: TripMap, gallons: number): boolean {
  return gallons < map.tuning.lowFuelPct * map.tuning.tankGallons
}

/**
 * The skip-poll default once fuel is known: a gas site the van would reach
 * low on fuel defaults to "stop" (M2 Gas decisions); everything else keeps its
 * authored default.
 */
export function effectiveSkipDefault(
  map: TripMap,
  site: TripSite,
  gallonsOnArrival?: number,
): SkipDefault {
  if (isGasSite(site) && gallonsOnArrival !== undefined && isLowFuel(map, gallonsOnArrival)) {
    return "stop"
  }
  return resolveSiteSettings(map, site).skipDefault
}

/** Whole coins to fill `gallons` at a base price scaled by the session's `costScale` (D15). */
export function gasCost(gallons: number, pricePerGallon: number, costScale = 1): number {
  if (gallons <= 0) return 0
  return Math.max(1, Math.round(gallons * pricePerGallon * costScale))
}

/** Miles from `mile` to the next gas site strictly ahead, or to the end of the route. */
export function milesToNextGas(map: TripMap, mile: number): number {
  const next = sortedSites(map).find((site) => site.mile > mile && isGasSite(site))
  return (next?.mile ?? routeMiles(map.route)) - mile
}

export type FuelPlanStop = {
  siteId: string
  mile: number
  gallonsOnArrival: number
  stops: boolean
  /** Gallons pumped when it stops (fill to full). */
  gallons: number
  /** Base coin cost at `costScale` 1. */
  baseCost: number
}

export type FuelPlan = {
  gallonsPerMile: number
  tankGallons: number
  /** Gauge curve: gallons at each mile where it changes slope or fills. */
  points: { mile: number; gallons: number }[]
  gasStops: FuelPlanStop[]
  /** First mile the gauge crosses `lowFuelPct`, or null. */
  lowAtMile: number | null
  /** First mile the tank runs dry, or null. */
  emptyAtMile: number | null
}

/**
 * Fuel along the route at base speed when nobody votes (ADR 0200): full at
 * departure, stopping at gas sites whose default is "stop" once fuel is
 * known. Shared by departure targets, the gas-desert lint, and Game Studio.
 */
export function fuelPlan(map: TripMap): FuelPlan {
  const gpm = baseGallonsPerMile(map)
  const tank = map.tuning.tankGallons
  const lowLine = map.tuning.lowFuelPct * tank
  const points = [{ mile: 0, gallons: tank }]
  const gasStops: FuelPlanStop[] = []
  let lowAtMile: number | null = null
  let emptyAtMile: number | null = null
  let gallons = tank
  let mile = 0

  const driveTo = (target: number) => {
    if (target <= mile) return
    const burned = (target - mile) * gpm
    if (lowAtMile === null && gallons >= lowLine && gallons - burned < lowLine && gpm > 0) {
      lowAtMile = mile + (gallons - lowLine) / gpm
    }
    if (gallons > 0 && gallons - burned <= 0 && gpm > 0) {
      const dryMile = mile + gallons / gpm
      if (emptyAtMile === null) emptyAtMile = dryMile
      points.push({ mile: dryMile, gallons: 0 })
    }
    gallons -= burned
    mile = target
    points.push({ mile, gallons: Math.max(0, gallons) })
  }

  for (const site of sortedSites(map)) {
    driveTo(site.mile)
    if (!isGasSite(site)) continue
    const onArrival = Math.max(0, gallons)
    const settings = resolveSiteSettings(map, site)
    const stops = !settings.optional || effectiveSkipDefault(map, site, onArrival) === "stop"
    const pumped = stops ? tank - onArrival : 0
    gasStops.push({
      siteId: site.id,
      mile: site.mile,
      gallonsOnArrival: onArrival,
      stops,
      gallons: pumped,
      baseCost: gasCost(pumped, site.services!.gas!.pricePerGallon),
    })
    if (stops) {
      gallons = tank
      points.push({ mile, gallons })
    }
  }
  driveTo(routeMiles(map.route))
  return { gallonsPerMile: gpm, tankGallons: tank, points, gasStops, lowAtMile, emptyAtMile }
}

/** A site's stop decision as far as it's known: undefined = undecided (poll pending). */
export type StopDecision = "stop" | "skip" | undefined

export type ParkPlan = {
  /** Mandatory stops (and optional stops already decided "stop"). */
  mandatoryMs: number
  /** What happens if nobody votes: mandatory stops plus optional stops whose default is "stop". */
  expectedMs: number
  /** Every stop taken. */
  maxMs: number
}

/**
 * Planned parking time along the route (ADR 0200). The one place that
 * decides which stops count, shared by the plugin's ETA and target, the
 * deadline lint, and Game Studio's projections. The destination never parks.
 *
 * @param afterMile - Only sites strictly beyond this mile count (default: all).
 * @param decisionFor - Known decisions for a live trip; omit for authoring-time plans.
 * @param defaultFor - What an undecided site does if nobody votes; defaults to
 *   the authoring-time fuel plan (gas sites reached low on fuel stop).
 */
export function parkPlan(
  map: TripMap,
  opts: {
    afterMile?: number
    decisionFor?: (site: TripSite) => StopDecision
    defaultFor?: (site: TripSite) => SkipDefault
  } = {},
): ParkPlan {
  const plan: ParkPlan = { mandatoryMs: 0, expectedMs: 0, maxMs: 0 }
  const defaultFor = opts.defaultFor ?? authoringDefaults(map)
  for (const site of map.sites) {
    if (isDestination(site)) continue
    if (opts.afterMile !== undefined && site.mile <= opts.afterMile) continue
    const decision = opts.decisionFor?.(site)
    if (decision === "skip") continue
    const settings = resolveSiteSettings(map, site)
    plan.maxMs += settings.parkMs
    if (decision === "stop" || !settings.optional) {
      plan.mandatoryMs += settings.parkMs
      plan.expectedMs += settings.parkMs
    } else if (defaultFor(site) === "stop") {
      plan.expectedMs += settings.parkMs
    }
  }
  return plan
}

/**
 * Live no-vote defaults from the van's position and tank (M2 Gas decisions):
 * walks the sites ahead at base burn, refilling at gas sites that will stop,
 * so a gas site reached low on fuel defaults to "stop".
 */
export function skipDefaultsAhead(
  map: TripMap,
  opts: {
    fromMile: number
    gallons: number
    gallonsPerMile: number
    decisionFor?: (site: TripSite) => StopDecision
  },
): (site: TripSite) => SkipDefault {
  const tank = map.tuning.tankGallons
  const defaults = new Map<string, SkipDefault>()
  let gallons = opts.gallons
  let mile = opts.fromMile
  for (const site of sortedSites(map)) {
    if (site.mile <= opts.fromMile) continue
    gallons -= (site.mile - mile) * opts.gallonsPerMile
    mile = site.mile
    const fallback = effectiveSkipDefault(map, site, Math.max(0, gallons))
    defaults.set(site.id, fallback)
    if (!isGasSite(site)) continue
    const decision = opts.decisionFor?.(site)
    const stops =
      decision === "stop" ||
      (decision === undefined && (!isOptionalSite(site) || fallback === "stop"))
    if (stops) gallons = tank
  }
  return (site) => defaults.get(site.id) ?? resolveSiteSettings(map, site).skipDefault
}

function authoringDefaults(map: TripMap): (site: TripSite) => SkipDefault {
  const gasStops = new Map(fuelPlan(map).gasStops.map((stop) => [stop.siteId, stop]))
  return (site) => {
    const gas = gasStops.get(site.id)
    return gas ? effectiveSkipDefault(map, site, gas.gallonsOnArrival) : resolveSiteSettings(map, site).skipDefault
  }
}

/** Sites ordered by mile (stable for equal miles). */
export function sortedSites(map: TripMap): TripSite[] {
  return [...map.sites].sort((a, b) => a.mile - b.mile)
}

/**
 * Miles at which a site reveals when driving at base speed: the earlier of the
 * distance reveal and its skip poll opening (D12c). Used for Studio ticks.
 */
export function revealMileAtBaseSpeed(map: TripMap, site: TripSite): number {
  const settings = resolveSiteSettings(map, site)
  const distanceMile = Math.max(0, site.mile - settings.revealMiles)
  if (!settings.optional || settings.mystery) return distanceMile
  const pollMile = Math.max(0, site.mile - (map.route.baseMph * settings.pollLeadMs) / 3_600_000)
  return Math.min(distanceMile, pollMile)
}

/** Default skip-poll question (D10, M1 Stops). */
export function skipPollQuestion(site: TripSite, milesAway: number, mystery: boolean): string {
  if (site.skipPoll?.question) return site.skipPoll.question
  if (mystery) return "Something's up ahead. Pull off?"
  const miles = Math.max(1, Math.round(milesAway))
  return `${site.name} in ${miles} mile${miles === 1 ? "" : "s"}: pull off?`
}
