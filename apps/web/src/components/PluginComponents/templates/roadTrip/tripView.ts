import { format } from "date-fns"
import type { TripStore, TripStoreSite, TripStoreSiteState } from "@repo/road-trip-map"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  interpolateFuelGallons,
  interpolateVanMile,
  vanConsumable,
  vanPart,
} from "@repo/road-trip-map"
import { useNow } from "../../../../hooks/useActors"
import { formatCountdown } from "../../../../lib/formatCountdown"
import { usePluginComponentContext } from "../../context"

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
  return { mile: interpolateVanMile(trip, now), gallons: interpolateFuelGallons(trip, now), now }
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

export function siteLabel(site: TripStoreSite): string {
  return site.state === "unrevealed" ? "?" : (site.name ?? "?")
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

export function nextSiteAhead(trip: TripStore, mile: number): TripStoreSite | undefined {
  return trip.sites.find(
    (site) => site.mile > mile && site.state !== "skipped" && site.state !== "visited",
  )
}

/** "road-trip:fix-a-flat" → "Fix-a-Flat". */
export function vanItemName(definitionId: string): string {
  const shortId = definitionId.split(":").pop() ?? definitionId
  return vanConsumable(shortId)?.name ?? vanPart(shortId)?.name ?? shortId
}

/** One-line strip context: live state first, then the next site (M7). */
export function stripContext(trip: TripStore, mile: number, now: number): string {
  if (trip.live?.kind === "fund") {
    const left = formatCountdown(trip.live.endsAt - now)
    const icon = trip.live.purpose === "gas" || trip.live.purpose === "delivery" ? "⛽" : "🧾"
    if (trip.live.mode === "voluntary") {
      return `${icon} ${FUND_PURPOSE_LABELS[trip.live.purpose]} pool ${trip.live.raised ?? 0}/${trip.live.cost} · Chip in · ${left}`
    }
    return trip.live.purpose === "gas"
      ? `⛽ Pumping gas · ${trip.live.cost} coins`
      : `${icon} ${trip.live.label} · ${trip.live.cost} coins`
  }
  if (trip.live?.kind === "incident") {
    const spec = INCIDENTS[trip.live.incident]
    const fix = trip.live.resolvesWith?.[0]
    const left = trip.live.endsAt !== undefined ? ` · ${formatCountdown(trip.live.endsAt - now)}` : ""
    return `${spec.emoji} ${spec.name}${fix ? ` · ${vanItemName(fix)}?` : ""}${left}`
  }
  if (trip.live?.kind === "parked") {
    const left = formatCountdown(trip.live.endsAt - now)
    return trip.live.shopOpen
      ? `Parked · ${trip.live.label} · shop open ${left}`
      : `Parked · ${trip.live.label} · back on the road in ${left}`
  }
  if (trip.live?.kind === "paused") return `Paused · ${trip.live.label}`
  if (trip.status === "loaded") return `Ready to leave · ${trip.mapTitle}`
  if (trip.status === "arrived" || trip.status === "late") {
    const destination = trip.sites.find((s) => s.destination)
    return `Arrived${destination?.name ? ` · ${destination.name}` : ""}`
  }
  if (trip.status === "ended" || trip.status === "stranded") return "Trip ended"
  const next = nextSiteAhead(trip, mile)
  if (!next) return trip.mapTitle
  const minutes = minutesToSite(trip, next, mile)
  return `Next: ${siteLabel(next)}${minutes !== null ? ` · ${minutes} min` : ""}`
}
