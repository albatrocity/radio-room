/**
 * Ledger of piecewise-constant legs (ADR 0200). Each leg stores prefix sums
 * (`mile`, `gallonsUsed`) at its start, so position and fuel need only the
 * latest leg and truncating old legs is safe. Pure; imported by Game Studio.
 */

export const MS_PER_HOUR = 3_600_000

export type LegReason =
  | "start"
  | "blocker-on"
  | "blocker-off"
  | "factor-on"
  | "factor-off"
  | "arrive"
  | "admin"

export type LegRates = { mph: number; gpm: number; engine: boolean }

export type Leg = LegRates & {
  /** Epoch ms the leg starts. */
  at: number
  /** Prefix sum: miles travelled at `at`. */
  mile: number
  /** Prefix sum: gallons burned at `at` (always 0 until Phase 2 fuel). */
  gallonsUsed: number
  reason: LegReason
  ref?: string
}

/** Position of a leg at time `t` (clamped to the leg start). */
export function project(leg: Leg, t: number): { mile: number; gallonsUsed: number } {
  const hours = Math.max(0, t - leg.at) / MS_PER_HOUR
  const miles = leg.mph * hours
  return { mile: leg.mile + miles, gallonsUsed: leg.gallonsUsed + miles * leg.gpm }
}

/** Start a new leg at `at`, carrying the previous leg's prefix sums forward. */
export function nextLeg(
  prev: Leg | null,
  at: number,
  rates: LegRates,
  reason: LegReason,
  ref?: string,
): Leg {
  const base = prev ? project(prev, at) : { mile: 0, gallonsUsed: 0 }
  const leg: Leg = { at, ...rates, ...base, reason }
  if (ref !== undefined) leg.ref = ref
  return leg
}

/** Only append when the rates actually changed, so recomputes don't add no-op legs. */
export function ratesChanged(prev: Leg | null, rates: LegRates): boolean {
  if (!prev) return true
  return prev.mph !== rates.mph || prev.gpm !== rates.gpm || prev.engine !== rates.engine
}

/** When the leg reaches `targetMile`; null if not moving or already past. */
export function timeToMile(current: Leg, targetMile: number): number | null {
  if (current.mph <= 0 || targetMile <= current.mile) return null
  return current.at + ((targetMile - current.mile) / current.mph) * MS_PER_HOUR
}

/** When cumulative fuel use reaches `targetGallonsUsed`; null if not burning. */
export function timeToGallonsUsed(current: Leg, targetGallonsUsed: number): number | null {
  const gph = current.mph * current.gpm
  if (gph <= 0 || targetGallonsUsed <= current.gallonsUsed) return null
  return current.at + ((targetGallonsUsed - current.gallonsUsed) / gph) * MS_PER_HOUR
}

/** A stopped leg at mile 0, used before departure. */
export const PARKED_AT_START: Leg = {
  at: 0,
  mph: 0,
  gpm: 0,
  engine: true,
  mile: 0,
  gallonsUsed: 0,
  reason: "start",
}
