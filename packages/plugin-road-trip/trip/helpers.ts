import type { TripMap, TripSite } from "@repo/road-trip-map"
import { formatShare, resolveSiteSettings, siteShopRequest, sortedSites } from "@repo/road-trip-map"
import type { SiteRuntime, TripFund, TripLogEvent, TripState } from "./state"

/**
 * Types and helpers shared by the pure transition modules (`transitions`,
 * `incidents`). `mutateTrip` runs transitions inside a CAS, so they must not
 * touch I/O and may run more than once.
 */

export type SignVariant = "info" | "success" | "warning" | "error"

export type TripEffect =
  | { type: "sign"; variant: SignVariant; title: string; body?: string; icon?: string }
  /** Site narrative. Chat prose, not a road sign. `variant` is the system-alert status. */
  | { type: "narrate"; body: string; variant?: SignVariant }
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

/** A site opens a shop when it lists custom offers or sells records (ADR 0214). */
export function hasSiteShop(site: TripSite): boolean {
  return siteShopRequest(site) !== null
}

/**
 * Open the site's shop, closing another scope's round first. `close` runs
 * before the arrival lines; `open` runs after the exit sign and narrative, so
 * the shop's opening message comes last.
 */
export function openShopAt(
  state: TripState,
  site: TripSite,
): { scopeId: string | undefined; close: TripEffect[]; open: TripEffect[] } {
  const scopeId = hasSiteShop(site) ? siteShopScopeId(state.tripId, site.id) : undefined
  const close: TripEffect[] =
    state.shopScopeId && state.shopScopeId !== scopeId
      ? [{ type: "close-shop", scopeId: state.shopScopeId }]
      : []
  const open: TripEffect[] = scopeId ? [{ type: "open-shop", siteId: site.id, scopeId }] : []
  return { scopeId, close, open }
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

/** Chat prose for a stop. Blank copy posts nothing. */
export function siteNarrative(site: TripSite): string | undefined {
  const text = site.narrative?.trim()
  return text ? text : undefined
}

/** Posted beside the exit sign, not as one. Only when the van actually stops. */
export function narrate(site: TripSite): TripEffect | null {
  const body = siteNarrative(site)
  if (!body) return null
  return {
    type: "narrate",
    body,
    ...(site.narrativeVariant ? { variant: site.narrativeVariant } : {}),
  }
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

/**
 * Once the room pulls off at an optional site, signs and skip polls for sites
 * this close past it wait until the van leaves the stop (ADR 0217).
 */
export const PULL_OFF_HOLD_MILES = 3

/**
 * The optional stop holding `site`'s sign and poll: one the room chose to pull
 * off at (stopping or parked), with `site` within `PULL_OFF_HOLD_MILES` past it.
 */
export function pullOffHold(state: TripState, map: TripMap, site: TripSite): TripSite | undefined {
  return sortedSites(map).find((stop) => {
    if (stop.id === site.id) return false
    const phase = state.sites[stop.id]?.phase
    if (phase !== "stopping" && phase !== "parked") return false
    if (!resolveSiteSettings(map, stop).optional) return false
    return site.mile >= stop.mile && site.mile - stop.mile <= PULL_OFF_HOLD_MILES
  })
}

/** The next stop isn't named: its sign and poll arrive when it comes into sight. */
export const BACK_ON_THE_ROAD: TripEffect = {
  type: "sign",
  variant: "info",
  icon: "🚐",
  title: "Back on the road",
}
