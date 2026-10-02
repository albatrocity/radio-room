import type { TripMap, TripSite } from "@repo/road-trip-map"
import { formatShare, sortedSites } from "@repo/road-trip-map"
import type { SiteRuntime, TripFund, TripLogEvent, TripState } from "./state"

/**
 * Types and helpers shared by the pure transition modules (`transitions`,
 * `incidents`). `mutateTrip` runs transitions inside a CAS, so they must not
 * touch I/O and may run more than once.
 */

export type SignVariant = "info" | "success" | "warning" | "error"

export type TripEffect =
  | { type: "sign"; variant: SignVariant; title: string; body?: string; icon?: string }
  | { type: "open-shop"; siteId: string; scopeId: string }
  | { type: "close-shop"; scopeId: string }
  | { type: "close-poll"; pollId: string }
  | { type: "nudge-host" }
  /** Automatic: collect the levy now. Voluntary: open the pool. */
  | { type: "open-fund"; fund: TripFund; title: string }
  /** Close a voluntary pool without settling it (the trip ended under it). */
  | { type: "close-pool"; fundId: string }
  /** One private message to each online user holding any of `itemIds` (M4 discoverability). */
  | { type: "nudge-holders"; itemIds: string[]; message: string }

export type TransitionContext = {
  now: number
  /** Van mile at `now`, projected from the current leg. */
  mile: number
  /** Ledger `gallonsUsed` at `now`. */
  gallonsUsed: number
  map: TripMap
  /** Session `costScale`, read before the CAS; locks fund costs as they open (D15). */
  costScale: number
}

export type TransitionResult = {
  next: TripState
  log?: TripLogEvent[]
  effects?: TripEffect[]
}

export type Transition = (state: TripState, ctx: TransitionContext) => TransitionResult | null

/** Arrival handlers tolerate float drift between the solved time and the projected mile. */
export const ARRIVAL_MILE_EPSILON = 0.02

/** Automatic mode holds the van this long while it "pumps" (M2 Funds and the van). */
export const AUTOMATIC_FUND_HOLD_MS = 20_000

/** A fund whose levy is still recording re-checks after this long. */
export const LEVY_RETRY_MS = 3_000

/** A levy that hasn't recorded after this long is assumed dead (its process crashed). */
export const LEVY_STALE_MS = 2 * 60_000

export function findSite(map: TripMap, siteId: string): TripSite | undefined {
  return map.sites.find((site) => site.id === siteId)
}

export function withSite(state: TripState, siteId: string, patch: Partial<SiteRuntime>): TripState {
  const current = state.sites[siteId]
  if (!current) return state
  return { ...state, sites: { ...state.sites, [siteId]: { ...current, ...patch } } }
}

export function siteShopScopeId(tripId: string, siteId: string): string {
  return `trip:${tripId}:site:${siteId}`
}

/** A site opens a shop when it names catalog shops or custom offers (D14). */
export function hasSiteShop(site: TripSite): boolean {
  return (site.shop?.shopIds?.length ?? 0) > 0 || (site.shop?.offers?.length ?? 0) > 0
}

/** Open the site's shop, closing another scope's round first. */
export function openShopAt(
  state: TripState,
  site: TripSite,
): { scopeId: string | undefined; effects: TripEffect[] } {
  const scopeId = hasSiteShop(site) ? siteShopScopeId(state.tripId, site.id) : undefined
  const effects: TripEffect[] = []
  if (state.shopScopeId && state.shopScopeId !== scopeId) {
    effects.push({ type: "close-shop", scopeId: state.shopScopeId })
  }
  if (scopeId) effects.push({ type: "open-shop", siteId: site.id, scopeId })
  return { scopeId, effects }
}

/** " from 3 travelers" / ", 1.2% of the van's wallets" after a fund total. */
export function fundShareCopy(fund: TripFund, collected: number, payers: number): string {
  if (fund.mode === "automatic" && fund.rate !== undefined && collected > 0) {
    return `, ${formatShare(fund.rate)} of the van's wallets`
  }
  return payers > 0 ? ` from ${payers} traveler${payers === 1 ? "" : "s"}` : ""
}

export function exitTitle(site: TripSite): string {
  return `EXIT ${Math.round(site.mile)} · ${site.name.toUpperCase()}`
}

export function milesLabel(miles: number): string {
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles)
  return `${rounded} mi`
}

export function pct(gallons: number, tank: number): number {
  return tank > 0 ? Math.max(0, Math.round((gallons / tank) * 100)) : 0
}

export function seededIndex(seed: number, key: string, length: number): number {
  let hash = seed | 0
  for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) | 0
  return Math.abs(hash) % length
}

// Lives in @repo/road-trip-map so Game Studio's estimates read like the notices players get.
export { formatShare }

/** Next site ahead of `mile` that the van will still reach (not skipped / visited). */
export function nextSiteAhead(state: TripState, map: TripMap, mile: number): TripSite | undefined {
  return sortedSites(map).find((site) => {
    const runtime = state.sites[site.id]
    if (!runtime) return false
    if (runtime.phase === "skipped" || runtime.phase === "visited" || runtime.phase === "parked") {
      return false
    }
    return site.mile > mile - ARRIVAL_MILE_EPSILON
  })
}

export function backOnTheRoad(state: TripState, map: TripMap, mile: number): TripEffect {
  const upcoming = nextSiteAhead(state, map, mile + ARRIVAL_MILE_EPSILON)
  const upcomingRuntime = upcoming ? state.sites[upcoming.id] : undefined
  return {
    type: "sign",
    variant: "info",
    icon: "🚐",
    title: "Back on the road",
    body:
      upcoming && upcomingRuntime?.revealed
        ? `Next: ${upcoming.name}, ${milesLabel(upcoming.mile - mile)}`
        : undefined,
  }
}
