import { format } from "date-fns"
import type { TripStore, TripStoreSite, TripStoreSiteState } from "@repo/road-trip-map"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  interpolateFuelGallons,
  interpolateVanMile,
  refillGallonsAt,
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

const MS_PER_HOUR = 3_600_000

/** Milliseconds of driving to `site` at the current speed, or null when stopped. */
export function msToSite(trip: TripStore, site: TripStoreSite, mile: number): number | null {
  if (trip.van.mph <= 0 || site.mile <= mile) return null
  return ((site.mile - mile) / trip.van.mph) * MS_PER_HOUR
}

/** `m:ss` under an hour, `h:mm:ss` beyond, rounded up so it never reads 0:00 early. */
export function formatDriveCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  if (hours === 0) return `${minutes}:${seconds}`
  return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
}

export function nextSiteAhead(trip: TripStore, mile: number): TripStoreSite | undefined {
  return trip.sites.find(
    (site) => site.mile > mile && site.state !== "skipped" && site.state !== "visited",
  )
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
    return `${spec.emoji} ${trip.live.name}${fix ? ` · ${vanItemName(fix)}?` : ""}${left}`
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
  const ms = msToSite(trip, next, mile)
  return `Next: ${siteLabel(next)}${ms !== null ? ` · ${formatDriveCountdown(ms)}` : ""}`
}

/** What the van is doing, for the strip's status word and its motion flourishes. */
export type VanPhase = "ready" | "cruising" | "exiting" | "parked" | "held" | "arrived" | "ended"

export const VAN_PHASE_LABEL: Record<VanPhase, string> = {
  ready: "Ready",
  cruising: "Cruising",
  exiting: "Exiting",
  parked: "Parked",
  held: "Stopped",
  arrived: "Arrived",
  ended: "Ended",
}

export function vanPhase(trip: TripStore, mile: number): VanPhase {
  if (trip.status === "loaded") return "ready"
  if (trip.status === "arrived" || trip.status === "late") return "arrived"
  if (trip.status === "ended" || trip.status === "stranded") return "ended"
  if (trip.live?.kind === "parked") return "parked"
  if (trip.van.mph > 0) {
    return nextSiteAhead(trip, mile)?.state === "stopping" ? "exiting" : "cruising"
  }
  return "held"
}

/** The strip's second row: `status | destination | countdown`. */
export type StripReadout = {
  status: string
  destination?: string
  countdown?: string
}

function revealedName(site: TripStoreSite | undefined): string | undefined {
  return site && site.state !== "unrevealed" ? site.name : undefined
}

/**
 * Live incidents and funds keep their headline whatever the van is doing
 * (a tow still rolls); otherwise the word comes from `phase`.
 */
export function stripReadout(
  trip: TripStore,
  mile: number,
  now: number,
  phase: VanPhase = vanPhase(trip, mile),
): StripReadout {
  const live = trip.live
  if (live?.kind === "fund") {
    const icon = live.purpose === "gas" || live.purpose === "delivery" ? "⛽" : "🧾"
    if (live.mode === "voluntary") {
      return {
        status: `${icon} ${FUND_PURPOSE_LABELS[live.purpose]} pool ${live.raised ?? 0}/${live.cost}`,
        destination: "Chip in",
        countdown: formatDriveCountdown(live.endsAt - now),
      }
    }
    return {
      status: live.purpose === "gas" ? "⛽ Pumping gas" : `${icon} ${live.label}`,
      destination: `${live.cost} coins`,
    }
  }
  if (live?.kind === "incident") {
    const spec = INCIDENTS[live.incident]
    const fix = live.resolvesWith?.[0]
    return {
      status: `${spec.emoji} ${live.name}`,
      ...(fix ? { destination: `${vanItemName(fix)}?` } : {}),
      ...(live.endsAt !== undefined ? { countdown: formatDriveCountdown(live.endsAt - now) } : {}),
    }
  }
  switch (phase) {
    case "parked": {
      if (live?.kind !== "parked") return { status: VAN_PHASE_LABEL.parked }
      return {
        status: VAN_PHASE_LABEL.parked,
        destination: live.shopOpen ? `${live.label} · shop open` : live.label,
        countdown: formatDriveCountdown(live.endsAt - now),
      }
    }
    case "cruising":
    case "exiting": {
      const next = nextSiteAhead(trip, mile)
      const ms = next ? msToSite(trip, next, mile) : null
      const destination = revealedName(next)
      return {
        status: VAN_PHASE_LABEL[phase],
        ...(destination ? { destination } : {}),
        ...(ms !== null ? { countdown: formatDriveCountdown(ms) } : {}),
      }
    }
    case "held":
      if (live?.kind === "paused") {
        return live.label === "Paused"
          ? { status: "Paused" }
          : { status: "Paused", destination: live.label }
      }
      return { status: VAN_PHASE_LABEL.held }
    case "ready":
      return { status: VAN_PHASE_LABEL.ready, destination: trip.mapTitle }
    case "arrived": {
      const destination = revealedName(trip.sites.find((s) => s.destination))
      return { status: VAN_PHASE_LABEL.arrived, ...(destination ? { destination } : {}) }
    }
    case "ended":
      return { status: VAN_PHASE_LABEL.ended }
  }
}
