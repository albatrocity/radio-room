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
 */
export function parkPlan(
  map: TripMap,
  opts: { afterMile?: number; decisionFor?: (site: TripSite) => StopDecision } = {},
): ParkPlan {
  const plan: ParkPlan = { mandatoryMs: 0, expectedMs: 0, maxMs: 0 }
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
    } else if (settings.skipDefault === "stop") {
      plan.expectedMs += settings.parkMs
    }
  }
  return plan
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
