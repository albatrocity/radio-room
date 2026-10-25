import type { SkipDefault, TripMap, TripSite } from "@repo/road-trip-map"
import { effectiveSkipDefault, isGasSite, milesToNextGas, sortedSites } from "@repo/road-trip-map"
import { milesLabel, pct, type TransitionContext } from "./helpers"
import { effectiveGpm, gallonsLeft, type TripState } from "./state"

/**
 * Fuel-aware site rules shared by the trip flow (vote defaults) and the
 * plugin (poll copy). Pure; `map` is the path map, so miles are odometer miles.
 */

/** Gallons in the tank when the van reaches `site`, at the current burn and without refills. */
export function gallonsOnArrival(
  state: TripState,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): number {
  const left = gallonsLeft(state, ctx.gallonsUsed)
  return Math.max(0, left - Math.max(0, site.mile - ctx.mile) * effectiveGpm(state))
}

/** A site's no-vote default with fuel known: low on arrival at a gas site means "stop". */
export function liveSkipDefault(
  state: TripState,
  map: TripMap,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): SkipDefault {
  return effectiveSkipDefault(map, site, gallonsOnArrival(state, site, ctx))
}

/**
 * Urgent gas copy for a low-fuel gas site's poll ("⛽ 12% · last gas for
 * 20 mi"); null when the site sells no gas or the tank isn't low.
 */
export function gasUrgency(
  state: TripState,
  map: TripMap,
  site: TripSite,
  ctx: Pick<TransitionContext, "mile" | "gallonsUsed">,
): string | null {
  if (!isGasSite(site)) return null
  const gallons = gallonsOnArrival(state, site, ctx)
  if (effectiveSkipDefault(map, site, gallons) !== "stop") return null
  if (gallons >= map.tuning.lowFuelPct * state.tankGallons) return null
  const after = milesToNextGas(map, site.mile)
  const nextIsGas = sortedSites(map).some((s) => s.mile > site.mile && isGasSite(s))
  return nextIsGas
    ? `⛽ ${pct(gallons, state.tankGallons)}% · last gas for ${milesLabel(after)}`
    : `⛽ ${pct(gallons, state.tankGallons)}% · last gas before the end`
}
