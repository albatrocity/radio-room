import { format } from "date-fns"
import type {
  TripStore,
  TripStoreEvent,
  TripStoreSite,
  TripStoreSiteState,
} from "@repo/road-trip-map"
import { interpolateFuelGallons, interpolateVanMile, refillGallonsAt } from "@repo/road-trip-map"
import { useNow } from "../../../../hooks/useActors"
import { nextSiteAhead } from "../../../../lib/roadTripVanPhase"
import { usePluginComponentContext } from "../../context"

export {
  formatDriveCountdown,
  siteLabel,
  stripContext,
  stripReadout,
  vanItemName,
  vanPhase,
  VAN_PHASE_LABEL,
} from "../../../../lib/roadTripVanPhase"
export type { StripReadout, VanPhase } from "../../../../lib/roadTripVanPhase"

export const DEFAULT_TRIP_KEY = "trip"

export function useTripStore(tripKey = DEFAULT_TRIP_KEY): TripStore | null {
  const { store } = usePluginComponentContext()
  const trip = store[tripKey] as TripStore | null | undefined
  return trip && Array.isArray(trip.sites) ? trip : null
}

/** Van mile and tank on the shared 1s ticker; no socket traffic between store emits. */
export function useInterpolatedVanMile(trip: TripStore | null): {
  mile: number
  gallons: number
  now: number
} {
  const now = useNow()
  if (!trip) return { mile: 0, gallons: 0, now }
  return {
    mile: interpolateVanMile(trip, now),
    gallons: refillingGallons(trip, interpolateFuelGallons(trip, now), now),
    now,
  }
}

/**
 * Gauge level during a refuel. Before the tank fills (pump, fuel truck) it
 * climbs on the window; after an instant fill it climbs up to the real level.
 */
export function refillingGallons(trip: TripStore, gallons: number, now: number): number {
  const refill = trip.fuel.refill
  if (!refill) return gallons
  const climbed = refillGallonsAt(refill, trip.fuel.tank, now)
  return gallons > refill.fromGallons ? Math.min(gallons, climbed) : climbed
}

export type FuelView = {
  gallons: number
  tank: number
  /** 0–1 */
  fraction: number
  low: boolean
  empty: boolean
  /** Miles left at the driving burn; null when the map burns no fuel. */
  rangeMiles: number | null
}

export function fuelView(trip: TripStore, gallons: number): FuelView {
  const { tank, lowPct } = trip.fuel
  const fraction = tank > 0 ? Math.min(1, Math.max(0, gallons / tank)) : 0
  const gpm = trip.fuel.drivingGallonsPerMile
  return {
    gallons,
    tank,
    fraction,
    low: fraction < lowPct,
    empty: gallons <= 0,
    rangeMiles: gpm > 0 ? gallons / gpm : null,
  }
}

/** The next gas site the van will still pass, when it's revealed. */
export function nextGasSite(trip: TripStore, mile: number): TripStoreSite | undefined {
  return trip.sites.find(
    (site) =>
      site.mile > mile &&
      site.gasPrice !== undefined &&
      site.state !== "skipped" &&
      site.state !== "visited",
  )
}

/** Session-scaled price per gallon, as players will be charged (D15). */
export function scaledGasPrice(trip: TripStore, basePrice: number): number {
  return Math.round(basePrice * trip.costScale * 100) / 100
}

export function formatClock(ms: number): string {
  return format(new Date(ms), "p")
}


export function formatMiles(miles: number): string {
  return `${Math.round(miles * 10) / 10}`
}

export function sitePin(site: TripStoreSite): string {
  return site.state === "unrevealed" ? "?" : (site.icon ?? "📍")
}

export const SITE_STATE_LABEL: Record<TripStoreSiteState, string> = {
  unrevealed: "Up ahead",
  ahead: "Ahead",
  polling: "Voting",
  stopping: "Stopping",
  parked: "Parked here",
  skipped: "Skipped",
  visited: "Visited",
}

/** Minutes of driving to `site` at the current speed, or null when stopped. */
export function minutesToSite(trip: TripStore, site: TripStoreSite, mile: number): number | null {
  if (trip.van.mph <= 0 || site.mile <= mile) return null
  return Math.max(1, Math.round(((site.mile - mile) / trip.van.mph) * 60))
}

/**
 * Trip tab heading. While the van is moving and no site is in view ahead
 * (secret stops stay off the store until they reveal), the map title gives
 * way to the current speed.
 */
export function tripTabTitle(trip: TripStore, mile: number): string {
  if (trip.van.mph > 0 && !trip.live && !nextSiteAhead(trip, mile)) {
    return `Cruising at ${Math.round(trip.van.mph)}mph`
  }
  return trip.mapTitle
}

export type TripLogRow =
  | { kind: "site"; key: string; site: TripStoreSite }
  | { kind: "event"; key: string; event: TripStoreEvent }

/**
 * Sites in route order with van events slotted in by mile, so the list reads
 * oldest to newest: the van only moves forward, and an event at a site's mile
 * happened while it was there.
 */
export function tripLog(trip: TripStore): TripLogRow[] {
  const events = trip.events ?? []
  const rows: TripLogRow[] = []
  let next = 0
  const eventRow = (index: number): TripLogRow => ({
    kind: "event",
    key: `event:${index}`,
    event: events[index]!,
  })
  for (const site of trip.sites) {
    while (next < events.length && events[next]!.mile < site.mile) rows.push(eventRow(next++))
    rows.push({ kind: "site", key: site.id, site })
  }
  while (next < events.length) rows.push(eventRow(next++))
  return rows
}
