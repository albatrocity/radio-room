/**
 * The `trip` store payload road-trip emits to clients (M7). Spoiler-safe:
 * unrevealed sites carry only id / mile / state, secret unrevealed sites are
 * omitted, and lore is present only once a site is visited.
 */

export type TripStoreStatus = "loaded" | "driving" | "arrived" | "late" | "ended" | "stranded"

export type TripStoreSiteState =
  | "unrevealed"
  | "ahead"
  | "polling"
  | "stopping"
  | "parked"
  | "skipped"
  | "visited"

export type TripStoreSite = {
  id: string
  mile: number
  state: TripStoreSiteState
  name?: string
  description?: string
  icon?: string
  imageUrl?: string
  mandatory?: boolean
  destination?: boolean
  /** Display title of the site's shop, when it has one. */
  shopTitle?: string
  lore?: string
  visitedAt?: number
  votes?: { stop: number; skip: number }
  defaulted?: boolean
}

export type TripStoreLive =
  | { kind: "parked"; label: string; siteId: string; endsAt: number; shopOpen: boolean }
  | { kind: "paused"; label: string }

export type TripStore = {
  status: TripStoreStatus
  tripId: string
  mapTitle: string
  routeMiles: number
  sites: TripStoreSite[]
  /** Interpolation anchor: `mile = anchorMile + mph × (now − anchorAt)`. */
  van: { anchorAt: number; anchorMile: number; mph: number }
  eta: { projectedArrivalAt: number | null; targetArrivalAt: number | null }
  live?: TripStoreLive
  departedAt?: number
  arrivedAt?: number
  endedAt?: number
  visitedCount: number
  siteCount: number
}

const MS_PER_HOUR = 3_600_000

/** Client-side mirror of `ledger.project` on the emitted anchor, clamped to the route. */
export function interpolateVanMile(
  trip: Pick<TripStore, "van" | "routeMiles">,
  now: number,
): number {
  const hours = Math.max(0, now - trip.van.anchorAt) / MS_PER_HOUR
  return Math.min(trip.routeMiles, trip.van.anchorMile + trip.van.mph * hours)
}
