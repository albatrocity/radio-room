import type { ConditionFacts, LinearPath, PathMap, TripMap, TripSite } from "@repo/road-trip-map"
import {
  FUND_PURPOSE_LABELS,
  formatShare,
  narrativeCaseIndex,
  narrativeForCase,
  resolveSiteSettings,
  siteShopRequest,
  sortedSites,
} from "@repo/road-trip-map"
import type { VoteTarget } from "./flow/events"
import type { SiteRuntime, TripFund, TripLogEvent, TripState } from "./state"

/**
 * Types and helpers shared by the pure transition modules (`transitions`,
 * `incidents`). `mutateTrip` runs transitions inside a CAS, so they must not
 * touch I/O and may run more than once.
 */

export type SignVariant = "info" | "success" | "warning" | "error"

export type TripEffect =
  | { type: "sign"; variant: SignVariant; title: string; body?: string; icon?: string }
  /**
   * Narrative. `icon` is set only when a site's system message is `site`
   * (ADR 0229): that line posts with the site glyph. `variant` is an alert status.
   */
  | { type: "narrate"; body: string; variant?: SignVariant; icon?: string }
  | { type: "open-shop"; siteId: string; scopeId: string }
  | { type: "close-shop"; scopeId: string }
  | { type: "close-poll"; pollId: string }
  /** Open a room poll for a vote now (an event choice step); the plugin runs `openVote`. */
  | { type: "open-vote"; target: VoteTarget }
  | { type: "nudge-host" }
  /** Automatic: collect the levy now. Voluntary: open the pool. */
  | { type: "open-fund"; fund: TripFund; title: string }
  /** Close a voluntary pool without settling it (the trip ended under it). */
  | { type: "close-pool"; fundId: string }
  /** One private message to each online user holding any of `itemIds` (M4 discoverability). */
  | { type: "nudge-holders"; itemIds: string[]; message: string }
  /** A reader-scope book was understood: apply its buff to the reader (ADR 0228). */
  | { type: "book-buff"; userId: string; shortId: string }
  /** The trip is over: take reader-scope book buffs back off these travelers. */
  | { type: "forget-books"; userIds: string[] }
  /**
   * A `give-item` outcome (ADR 0230): `qty` of `item` (a full definition id) to
   * every online traveler, or to one of them. `pick` seeds the random choice
   * (`giveItemsRecipients`), so the plugin and the simulator agree.
   */
  | { type: "give-items"; item: string; to: "everyone" | "random"; qty: number; pick: string }

export type TransitionContext = {
  now: number
  /** Van odometer mile at `now`, projected from the current leg. */
  mile: number
  /** Ledger `gallonsUsed` at `now`. */
  gallonsUsed: number
  /**
   * The map laid flat along the van's path (ADR 0222): active sites and events
   * at odometer miles. Everything but the flow reads this one.
   */
  map: PathMap
  /** The path `map` was laid along (forks and rejoins ahead). */
  path: LinearPath
  /** The authored map. Only `flow/` reads it (routes, layers, junction definitions). */
  source: TripMap
  /** Session `costScale`, read before the CAS; locks fund costs as they open (D15). */
  costScale: number
  /** Open polls' counts by option order, read before the CAS (the only vote I/O a transition needs). */
  tallies?: Record<string, number[]>
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

/** How long a fund step holds the van. Automatic is a short pump; voluntary uses the map window. */
export function fundHoldMs(
  mode: TripFund["mode"],
  map: { tuning: { funds: { windowMinutes: number } } },
): number {
  return mode === "automatic" ? AUTOMATIC_FUND_HOLD_MS : map.tuning.funds.windowMinutes * 60_000
}

/**
 * Pool title for an open fund. Live `open-fund` effects and the trip sim both
 * use this, so Game Studio's pool card matches a room.
 */
export function fundPoolTitle(
  fund: Pick<TripFund, "purpose" | "siteId" | "provider">,
  map: { sites: readonly { id: string; name?: string }[] },
): string {
  if (fund.purpose === "gas") {
    const site = map.sites.find((entry) => entry.id === fund.siteId)
    return `Gas at ${site?.name ?? "the station"}`
  }
  return `${FUND_PURPOSE_LABELS[fund.purpose]} · ${fund.provider ?? "the mechanic"}`
}

/** A fund whose levy is still recording re-checks after this long. */
export const LEVY_RETRY_MS = 3_000

/** A levy that hasn't recorded after this long is assumed dead (its process crashed). */
export const LEVY_STALE_MS = 2 * 60_000

export function findSite(map: TripMap, siteId: string): TripSite | undefined {
  return map.sites.find((site) => site.id === siteId)
}

/**
 * Patch a site's data. Its `phase` and `vote` change only through the trip
 * flow (ADR 0222), so the patch type leaves them out.
 */
export function withSite(
  state: TripState,
  siteId: string,
  patch: Partial<Omit<SiteRuntime, "phase" | "vote">>,
): TripState {
  const current = state.sites[siteId]
  if (!current) return state
  return { ...state, sites: { ...state.sites, [siteId]: { ...current, ...patch } } }
}

export function siteShopScopeId(tripId: string, siteId: string): string {
  return `trip:${tripId}:site:${siteId}`
}

/** A site opens a shop when it lists custom offers or sells records (ADR 0222). */
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

/** A site runtime's record of which narrative cases posted (ADR 0230). */
type PostedCases = Pick<SiteRuntime, "narrativeCase" | "departNarrativeCase">

/** The arrival case that holds now, to record on the site as it posts (ADR 0230). */
export function visitNarrativeCase(site: TripSite, facts: ConditionFacts): number | undefined {
  return narrativeCaseIndex(site.narrativeCases, facts)
}

/** The departure case that holds now, to record on the site as it posts (ADR 0230). */
export function departNarrativeCase(site: TripSite, facts: ConditionFacts): number | undefined {
  return narrativeCaseIndex(site.departNarrativeCases, facts)
}

function blankless<T extends { text: string }>(resolved: T | undefined): T | undefined {
  const text = resolved?.text.trim()
  return resolved && text ? { ...resolved, text } : undefined
}

function visitText(site: TripSite, caseIndex: number | undefined) {
  return blankless(
    narrativeForCase(
      site.narrativeCases,
      { text: site.narrative, variant: site.narrativeVariant },
      caseIndex,
    ),
  )
}

function departText(site: TripSite, caseIndex: number | undefined) {
  return blankless(
    narrativeForCase(
      site.departNarrativeCases,
      { text: site.departNarrative, variant: site.departNarrativeVariant },
      caseIndex,
    ),
  )
}

/**
 * Chat prose for a stop: the narrative case that posted (`runtime.narrativeCase`),
 * else `narrative`. Blank copy posts nothing.
 */
export function siteNarrative(site: TripSite, runtime?: PostedCases): string | undefined {
  return visitText(site, runtime?.narrativeCase)?.text
}

/** Chat prose for leaving a stop (ADR 0226): the departure case that posted, else `departNarrative`. */
export function siteDepartNarrative(site: TripSite, runtime?: PostedCases): string | undefined {
  return departText(site, runtime?.departNarrativeCase)?.text
}

export type TripNarrativeEntry = {
  siteId: string
  name: string
  icon: string
  /** `visit` posts when the van stops; `depart` when it leaves (ADR 0226). */
  moment: "visit" | "depart"
  at: number
  body: string
}

/**
 * Every narrative posted so far, oldest first. A site's visit narrative posts
 * exactly when it gets `visitedAt` (park, destination arrival, tow); its
 * departure narrative exactly when it gets `leftAt`.
 */
export function tripNarrative(
  map: TripMap,
  sites: Record<string, { visitedAt?: number; leftAt?: number } & PostedCases>,
): TripNarrativeEntry[] {
  return map.sites
    .flatMap((site) => {
      const runtime = sites[site.id]
      const base = { siteId: site.id, name: site.name, icon: site.icon }
      const entries: TripNarrativeEntry[] = []
      const visit = siteNarrative(site, runtime)
      if (runtime?.visitedAt !== undefined && visit) {
        entries.push({ ...base, moment: "visit", at: runtime.visitedAt, body: visit })
      }
      const depart = siteDepartNarrative(site, runtime)
      if (runtime?.leftAt !== undefined && depart) {
        entries.push({ ...base, moment: "depart", at: runtime.leftAt, body: depart })
      }
      return entries
    })
    .sort((a, b) => a.at - b.at)
}

/** A site narrative whose system message is `site` carries the site glyph and no alert status. */
function siteNarrate(
  body: string,
  icon: string,
  variant: TripSite["narrativeVariant"],
): TripEffect {
  if (variant === "site") return { type: "narrate", body, icon }
  return { type: "narrate", body, ...(variant ? { variant } : {}) }
}

/**
 * Posted beside the exit sign, not as one. Only when the van actually stops.
 * `caseIndex`: the narrative case recorded on the site as it arrived (ADR 0230).
 */
export function narrate(site: TripSite, caseIndex?: number): TripEffect | null {
  const resolved = visitText(site, caseIndex)
  if (!resolved) return null
  return siteNarrate(resolved.text, site.icon, resolved.variant)
}

/** Posted as the van pulls back onto the road, before departure outcomes. */
export function departNarrate(site: TripSite, caseIndex?: number): TripEffect | null {
  const resolved = departText(site, caseIndex)
  if (!resolved) return null
  return siteNarrate(resolved.text, site.icon, resolved.variant)
}

/**
 * Who a `give-items` effect reaches (ADR 0230): every online traveler, or one
 * picked from them by the trip seed and the effect's `pick`.
 */
export function giveItemsRecipients(
  effect: Extract<TripEffect, { type: "give-items" }>,
  online: readonly string[],
  seed: number,
): string[] {
  if (online.length === 0) return []
  if (effect.to === "everyone") return [...online]
  return [online[seededIndex(seed, effect.pick, online.length)]!]
}

/** The road sign after a `give-items` effect ran; null when nobody got anything. */
export function giveItemsSign(
  effect: Extract<TripEffect, { type: "give-items" }>,
  item: { name: string; icon?: string },
  recipients: readonly string[],
): Extract<TripEffect, { type: "sign" }> | null {
  if (recipients.length === 0) return null
  const what = effect.qty > 1 ? `${effect.qty}× ${item.name}` : item.name
  const who = effect.to === "everyone" ? "Everyone" : (recipients[0] ?? "Someone")
  return {
    type: "sign",
    variant: "success",
    title: `${who} got ${what}`,
    body: effect.to === "everyone" ? "Check your inventory." : `It's in ${who}'s inventory.`,
    ...(item.icon ? { icon: item.icon } : {}),
  }
}

/** Chat meta for a `narrate` effect. An `icon` means the author picked the site message. */
export function narrateMessageMeta(effect: Extract<TripEffect, { type: "narrate" }>): {
  type: "site" | "prose"
  icon?: string
  status?: SignVariant
} {
  if (effect.icon) {
    return {
      type: "site",
      icon: effect.icon,
      ...(effect.variant ? { status: effect.variant } : {}),
    }
  }
  return { type: "prose", ...(effect.variant ? { status: effect.variant } : {}) }
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
 * this close past it wait until the van leaves the stop (ADR 0225).
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
export const BACK_ON_THE_ROAD: Extract<TripEffect, { type: "sign" }> = {
  type: "sign",
  variant: "info",
  icon: "Van",
  title: "Back on the road",
}
