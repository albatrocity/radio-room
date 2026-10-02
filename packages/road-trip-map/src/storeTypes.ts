/**
 * The `trip` store payload road-trip emits to clients (M7). Spoiler-safe:
 * unrevealed sites carry only id / mile / state, secret unrevealed sites are
 * omitted, and lore and the 3D model are present only once a site is visited.
 */

import type { IncidentFundPurpose, IncidentStep } from "./incidents"
import type { FundsMode, IncidentId } from "./schema"
import type { PartSlot, VanFactor } from "./van"

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
  /** Base gas price per gallon, when the site sells gas. */
  gasPrice?: number
  /** Engine Failure tows here. */
  mechanic?: true
  lore?: string
  /** GLB URL for the detail stage; visited sites only (D12a). */
  modelUrl?: string
  visitedAt?: number
  votes?: { stop: number; skip: number }
  defaulted?: boolean
}

export type TripFundPurpose = "gas" | IncidentFundPurpose

export type TripStoreLive =
  | { kind: "parked"; label: string; siteId: string; endsAt: number; shopOpen: boolean }
  | { kind: "paused"; label: string }
  | {
      kind: "incident"
      label: string
      incident: IncidentId
      /** Ends on its own then (D22); absent while towing. */
      endsAt?: number
      /** Full item ids that end the current step ("🛞 Blown tire · Fix-a-Flat?"). */
      resolvesWith?: string[]
    }
  | {
      kind: "fund"
      label: string
      purpose: TripFundPurpose
      mode: FundsMode
      siteId?: string
      /** Locked cost in coins (D15). */
      cost: number
      /** Voluntary: coins pledged so far. */
      raised?: number
      endsAt: number
    }

/** Interpolation anchor for the gauge: `gallons = anchorGallons − mph × gallonsPerMile × (now − anchorAt)`. */
export type TripStoreFuel = {
  anchorAt: number
  anchorGallons: number
  /** Burn of the leg in force (0 while stopped). */
  gallonsPerMile: number
  /**
   * Burn while driving with installed parts applied (not the map's base rate),
   * for range readouts even when the van is stopped.
   */
  drivingGallonsPerMile: number
  tank: number
  lowPct: number
}

export type TripStoreVanPart = {
  slot: PartSlot
  partId: string
  name: string
  emoji: string
  installedBy?: string
}

export type TripStoreIncident = {
  incident: IncidentId
  name: string
  emoji: string
  /** Current step's label ("Waiting on the shoulder", "Tow · 60 coins"). */
  step: string
  stepKind: IncidentStep["kind"]
  endsAt?: number
  /** Full item ids that end the current step. */
  resolvesWith: string[]
}

/** Van tab (M7 `van_sheet`): installed parts and what's shaping speed and burn. */
export type TripStoreVanSheet = {
  parts: TripStoreVanPart[]
  baseMph: number
  /** Speed with every factor applied, ignoring stops. */
  cruisingMph: number
  speedFactors: VanFactor[]
  mpgFactors: VanFactor[]
  incident?: TripStoreIncident
  /** Incidents waiting for the current one (or a stop) to end. */
  queued: number
}

export type TripStore = {
  status: TripStoreStatus
  tripId: string
  mapTitle: string
  routeMiles: number
  sites: TripStoreSite[]
  /** Interpolation anchor: `mile = anchorMile + mph × (now − anchorAt)`. */
  van: { anchorAt: number; anchorMile: number; mph: number }
  fuel: TripStoreFuel
  funds: { mode: FundsMode }
  /** Session `costScale` at publish time, for price display (D15). */
  costScale: number
  eta: { projectedArrivalAt: number | null; targetArrivalAt: number | null }
  live?: TripStoreLive
  vanSheet: TripStoreVanSheet
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

/** Gallons in the tank at `now`, from the emitted anchors (never below zero). */
export function interpolateFuelGallons(trip: Pick<TripStore, "van" | "fuel">, now: number): number {
  const hours = Math.max(0, now - trip.fuel.anchorAt) / MS_PER_HOUR
  const burned = trip.van.mph * hours * trip.fuel.gallonsPerMile
  return Math.max(0, trip.fuel.anchorGallons - burned)
}
