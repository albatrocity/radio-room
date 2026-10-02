import { format } from "date-fns"
import type { TripStore, TripStoreSite, TripStoreSiteState } from "@repo/road-trip-map"
import { interpolateVanMile } from "@repo/road-trip-map"
import { useNow } from "../../../../hooks/useActors"
import { formatCountdown } from "../../../../lib/formatCountdown"
import { usePluginComponentContext } from "../../context"

export const DEFAULT_TRIP_KEY = "trip"

export function useTripStore(tripKey = DEFAULT_TRIP_KEY): TripStore | null {
  const { store } = usePluginComponentContext()
  const trip = store[tripKey] as TripStore | null | undefined
  return trip && Array.isArray(trip.sites) ? trip : null
}

/** Van mile on the shared 1s ticker; no socket traffic between store emits. */
export function useInterpolatedVanMile(trip: TripStore | null): { mile: number; now: number } {
  const now = useNow()
  if (!trip) return { mile: 0, now }
  return { mile: interpolateVanMile(trip, now), now }
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

/** One-line strip context: live state first, then the next site (M7). */
export function stripContext(trip: TripStore, mile: number, now: number): string {
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
