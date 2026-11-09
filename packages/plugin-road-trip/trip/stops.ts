import type { TripSite } from "@repo/road-trip-map"
import { gasCost, isDestination, resolveSiteSettings, siteShopTitle } from "@repo/road-trip-map"
import type { Emit, FlowAcc } from "./flow/dispatch"
import { openVoteTargets } from "./flow/entities/vote"
import {
  AUTOMATIC_FUND_HOLD_MS,
  exitTitle,
  narrate,
  openShopAt,
  type TransitionContext,
  type TripEffect,
} from "./helpers"
import {
  gallonsLeft,
  personalBookReaderIds,
  type Blocker,
  type TripFund,
  type TripLogEvent,
  type TripState,
} from "./state"

/**
 * Stop mechanics (blockers, shops, gas funds). No phases: the trip flow's
 * site and trip entities call these from `onEnter` after their own move.
 */

/** Open a gas fund step when the van parks at a gas site with room in the tank (M2). */
function openGasFund(
  state: TripState,
  ctx: TransitionContext,
  site: TripSite,
): { fund: TripFund; blocker: Blocker; effect: TripEffect; summary: string } | null {
  const price = site.services?.gas?.pricePerGallon
  if (price === undefined || isDestination(site)) return null
  const tank = Math.max(0, gallonsLeft(state, ctx.gallonsUsed))
  const gallons = Math.max(0, state.tankGallons - tank)
  const cost = gasCost(gallons, price, ctx.costScale)
  if (cost <= 0) return null
  const mode = state.fundsMode
  const holdMs =
    mode === "automatic" ? AUTOMATIC_FUND_HOLD_MS : ctx.map.tuning.funds.windowMinutes * 60_000
  const id = `fund:${state.tripId}:${site.id}:${ctx.now}`
  const fund: TripFund = {
    id,
    purpose: "gas",
    mode,
    siteId: site.id,
    cost,
    gallons,
    openedAt: ctx.now,
    endsAt: ctx.now + holdMs,
  }
  const gal = Math.round(gallons * 10) / 10
  return {
    fund,
    blocker: {
      id: `fund:${site.id}`,
      kind: "fund",
      since: ctx.now,
      until: fund.endsAt,
      siteId: site.id,
    },
    effect: { type: "open-fund", fund, title: `Gas at ${site.name}` },
    summary:
      mode === "automatic"
        ? `Pumping ${gal} gal: ${cost} coins.`
        : `${gal} gal for ${cost} coins. Chip in!`,
  }
}

/**
 * The van parks at `site`: park blocker, exit sign, narrative, shop, gas fund.
 * `wasRevealed`, `votes`, `defaulted`: the site's runtime before it parked, for the log.
 */
export function parkAt(
  acc: FlowAcc,
  ctx: TransitionContext,
  site: TripSite,
  before: { wasRevealed: boolean; votes?: { stop: number; skip: number }; defaulted?: boolean },
): FlowAcc {
  const state = acc.next
  const { map, now } = ctx
  const settings = resolveSiteSettings(map, site)
  const until = now + settings.parkMs
  const blocker: Blocker = {
    id: `park:${site.id}`,
    kind: "parked",
    since: now,
    until,
    siteId: site.id,
  }
  const shop = openShopAt(state, site)
  // Exit sign, then narrative, then the shop opens (its opening line last).
  const effects: TripEffect[] = [...shop.close]
  const gas = state.fund ? null : openGasFund(state, ctx, site)
  const minutes = Math.round(settings.parkMs / 60_000)
  effects.push({
    type: "sign",
    variant: gas ? "success" : "info",
    icon: site.icon,
    title: exitTitle(site),
    body: gas
      ? `Parked for ${minutes} min. ${gas.summary}`
      : shop.scopeId
        ? `Parked for ${minutes} min. ${siteShopTitle(site)} is open.`
        : `Parked for ${minutes} min. ${site.description}`,
  })
  const narrative = narrate(site, state.sites[site.id]?.narrativeCase)
  if (narrative) effects.push(narrative)
  effects.push(...shop.open)
  if (gas) effects.push(gas.effect)
  const blockers = [...state.blockers.filter((b) => b.kind !== "parked"), blocker]
  if (gas) blockers.push(gas.blocker)
  const log: TripLogEvent[] = []
  if (!before.wasRevealed)
    log.push({ kind: "site", siteId: site.id, name: site.name, phase: "revealed" })
  log.push({
    kind: "site",
    siteId: site.id,
    name: site.name,
    phase: "stopped",
    ...(before.votes ? { votes: before.votes } : {}),
    ...(before.defaulted !== undefined ? { defaulted: before.defaulted } : {}),
  })
  return {
    next: { ...state, blockers, shopScopeId: shop.scopeId, ...(gas ? { fund: gas.fund } : {}) },
    log: [...acc.log, ...log],
    effects: [...acc.effects, ...effects],
  }
}

/**
 * Close polls, shops, pools, and incidents when the trip stops for good. Open
 * votes cancel and parked stops end through the flow.
 */
export function closeOpenWork(acc: FlowAcc, emit: Emit): FlowAcc {
  let next = acc
  for (const target of openVoteTargets(next.next)) {
    next = emit(next, { type: "VOTE_CANCEL", target })
  }
  for (const [siteId, runtime] of Object.entries(next.next.sites)) {
    if (runtime.phase === "parked") next = emit(next, { type: "SITE_LEAVE", siteId })
  }
  const state = next.next
  const effects: TripEffect[] = []
  if (state.shopScopeId) effects.push({ type: "close-shop", scopeId: state.shopScopeId })
  if (state.fund?.mode === "voluntary") effects.push({ type: "close-pool", fundId: state.fund.id })
  const readers = personalBookReaderIds(state)
  if (readers.length > 0) effects.push({ type: "forget-books", userIds: readers })
  return {
    next: {
      ...state,
      blockers: [],
      speedFactors: [],
      shopScopeId: undefined,
      fund: undefined,
      incident: undefined,
      incidentQueue: [],
    },
    log: next.log,
    effects: [...next.effects, ...effects],
  }
}
