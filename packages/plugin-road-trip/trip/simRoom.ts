import type { ChatMessage, OpenRoomShopRequest, Poll, PollHistoryEntry } from "@repo/types"
import type { EscrowPoolState } from "@repo/plugin-base"
import {
  ROAD_TRIP_PLUGIN_NAME,
  siteOpenRoomShopRequest,
  siteShopRequest,
  siteShopTitle,
  tripGuideItem,
  tripKeyItemFor,
  tripMapForItem,
  tripMapItemShortId,
  vanConsumable,
  vanFuelItem,
  vanPart,
  type TripMap,
  type TripMapInput,
  type TripStore,
  type TriggerableIncidentId,
} from "@repo/road-trip-map"
import { poolCardView } from "../presenters"
import { dispatch, targetKey, type VoteTarget } from "./flow"
import { buildStatusLines, buildTripStore } from "./projection"
import { conditionFacts, type SkipVotes, type TripLogEntry } from "./state"
import { TripSim, type OpenPoll, type SimEvent, type SimStep } from "./testSim"
import { fundPoolTitle, giveItemsSign, narrateMessageMeta } from "./helpers"
import { depart, endTrip, type TripEffect } from "./transitions"
import { skipIncidentStep, triggerIncident, useIncidentItem } from "./incidents"
import { layersToUnlock, openTripMap } from "./guide"

/**
 * What the Game Studio trip simulator posts to studio-bridge (`POST /trip-sim`,
 * ADR 0221). `store` is the road-trip plugin store payload; `messages` is every
 * trip chat line so far; `poll` is the open skip poll.
 */
export type TripSimSnapshot = {
  roomId: string
  /** Bumped on every change, so the bridge can tell a reset from a step. */
  version: number
  /** Changes on reset; the bridge replaces instead of appending. */
  runId: string
  store: Record<string, unknown>
  messages: ChatMessage[]
  poll: Poll | null
  /** The last skip poll that closed, with its tally. */
  lastClosedPoll: PollHistoryEntry | null
}

export type SimTraveler = { userId: string; name: string }

export type SimIncidentItem = { shortId: string; name: string; emoji: string }

const SIM_POLL_CREATOR = "trip-sim"
const SIM_TRAVELER: SimTraveler = { userId: "studio", name: "Studio" }

function systemChat(content: string, meta: ChatMessage["meta"], at: number): ChatMessage {
  return {
    user: { userId: "system", username: "system", id: "system" } as ChatMessage["user"],
    content,
    meta,
    timestamp: new Date(at).toISOString(),
  }
}

/** A trip effect as the plugin's `runEffects` would post it to chat, or null if it posts nothing. */
export function effectToChat(effect: TripEffect, at: number): ChatMessage | null {
  if (effect.type === "sign") {
    return systemChat(
      effect.body ?? effect.title,
      {
        type: "alert",
        status: effect.variant,
        title: effect.title,
        theme: "road-trip",
        ...(effect.icon ? { icon: effect.icon } : {}),
      },
      at,
    )
  }
  if (effect.type === "narrate") {
    return systemChat(effect.body, narrateMessageMeta(effect), at)
  }
  return null
}

/** An item's name for sim chat: road-trip items from the map and catalog, others by their short id. */
function simItem(map: TripMap, definitionId: string): { name: string } {
  const split = definitionId.indexOf(":")
  const shortId = split >= 0 ? definitionId.slice(split + 1) : definitionId
  if (definitionId.slice(0, split) === ROAD_TRIP_PLUGIN_NAME) {
    const found =
      tripMapForItem(map, shortId) ??
      tripKeyItemFor(map, shortId) ??
      vanPart(shortId) ??
      vanConsumable(shortId) ??
      tripGuideItem(shortId) ??
      vanFuelItem(shortId)
    if (found) return { name: found.name }
  }
  return { name: shortId }
}

/**
 * A `give-items` effect as the plugin's road sign (ADR 0230), naming the sim's
 * travelers by user id. `item` overrides the name lookup (e.g. Studio's catalog).
 */
export function giveItemsToChat(
  effect: Extract<TripEffect, { type: "give-items" }>,
  recipients: readonly string[],
  item: { name: string; icon?: string },
  at: number,
): ChatMessage | null {
  const sign = giveItemsSign(effect, item, recipients)
  return sign ? effectToChat(sign, at) : null
}

/**
 * Move a store's sim-clock times onto the wall clock and stop the van, so the
 * Room UI (which interpolates from its own clock) shows the sim's position
 * and countdowns relative to now.
 */
export function freezeStoreForRoom(store: TripStore, simNow: number, wallNow: number): TripStore {
  const shift = (t: number) => t - simNow + wallNow
  const shiftOpt = (t: number | null) => (t === null ? null : shift(t))
  const frozen: TripStore = {
    ...store,
    sites: store.sites.map((site) =>
      site.visitedAt !== undefined ? { ...site, visitedAt: shift(site.visitedAt) } : site,
    ),
    van: { ...store.van, anchorAt: wallNow, mph: 0 },
    fuel: { ...store.fuel, anchorAt: wallNow, gallonsPerMile: 0 },
    eta: {
      projectedArrivalAt: shiftOpt(store.eta.projectedArrivalAt),
      targetArrivalAt: shiftOpt(store.eta.targetArrivalAt),
    },
  }
  if (store.departedAt !== undefined) frozen.departedAt = shift(store.departedAt)
  if (store.arrivedAt !== undefined) frozen.arrivedAt = shift(store.arrivedAt)
  if (store.endedAt !== undefined) frozen.endedAt = shift(store.endedAt)
  if (store.events) frozen.events = store.events.map((e) => ({ ...e, at: shift(e.at) }))
  if (store.live && "endsAt" in store.live && store.live.endsAt !== undefined) {
    frozen.live = { ...store.live, endsAt: shift(store.live.endsAt) }
  }
  const incident = store.vanSheet.incident
  if (incident?.endsAt !== undefined) {
    frozen.vanSheet = {
      ...store.vanSheet,
      incident: { ...incident, endsAt: shift(incident.endsAt) },
    }
  }
  if (store.vanSheet.keyItems) {
    frozen.vanSheet = {
      ...frozen.vanSheet,
      keyItems: store.vanSheet.keyItems.map((key) => ({ ...key, at: shift(key.at) })),
    }
  }
  return frozen
}

function tally(poll: Poll, counts: number[], closedAt: number): PollHistoryEntry["results"] {
  const optionTallies = Object.fromEntries(poll.options.map((o, i) => [o.id, counts[i] ?? 0]))
  const top = Math.max(0, ...counts)
  const leaders = poll.options.filter((_, i) => (counts[i] ?? 0) === top)
  return {
    pollId: poll.id,
    totalVotes: counts.reduce((sum, n) => sum + n, 0),
    optionTallies,
    winners: top > 0 && leaders.length === 1 ? [leaders[0]!.id] : [],
    closedAt,
  }
}

/**
 * Real shop rounds for the simulator's stops (e.g. Game Studio's sandbox Item
 * Shops). Without one, a stop's shop is approximated by its opening line.
 */
export type SimShops = {
  open(request: OpenRoomShopRequest): void
  close(scopeId: string): void
}

/**
 * The Game Studio trip simulator (ADR 0221): `TripSim` plus what the Room UI
 * needs to show it. Chat lines get wall-clock timestamps as they're produced;
 * the skip poll and pool card are built with the plugin's own presenters.
 */
export class TripSimRoom {
  readonly sim: TripSim
  readonly roomId: string
  readonly runId: string
  messages: ChatMessage[] = []
  poll: Poll | null = null
  lastClosedPoll: PollHistoryEntry | null = null
  version = 0
  private effectCursor = 0
  private lastMessageAt = 0
  private openPoll: OpenPoll | null = null
  private readonly clock: () => number
  private readonly shops: SimShops | undefined
  /** The shop round this run opened and hasn't closed. */
  openShopScopeId: string | null = null

  constructor(
    input: TripMapInput,
    options: { roomId: string; clock?: () => number; shops?: SimShops },
  ) {
    this.clock = options.clock ?? Date.now
    this.roomId = options.roomId
    this.shops = options.shops
    this.sim = new TripSim(input, this.clock())
    this.runId = `sim-${this.clock().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  }

  get state() {
    return this.sim.state
  }

  get log(): TripLogEntry[] {
    return this.sim.log
  }

  mile(): number {
    return this.sim.mile()
  }

  peekNext(): SimEvent | null {
    return this.state.status === "driving" ? this.sim.peekNext() : null
  }

  /** The site whose skip poll is open in the sim, if any. */
  openPollSiteId(): string | null {
    return this.sim.polls[0]?.siteId ?? null
  }

  /** The vote whose poll is open in the sim (a site exit, a junction, an event choice). */
  openPollTarget(): VoteTarget | null {
    return this.sim.polls[0]?.target ?? null
  }

  depart(): boolean {
    return this.after(this.sim.apply(depart))
  }

  step(): SimStep | null {
    if (this.state.status !== "driving") return null
    const stepped = this.sim.stepNext()
    this.after(stepped !== null)
    return stepped
  }

  /** Votes the open skip poll will close with. */
  setVotes(votes: SkipVotes): void {
    const siteId = this.openPollSiteId()
    if (!siteId) return
    this.sim.votes[siteId] = votes
    this.after(true)
  }

  votesFor(siteId: string): SkipVotes {
    return this.sim.votes[siteId] ?? { stop: 0, skip: 0 }
  }

  /** Counts (by option order) the open poll will close with: any vote, sites included. */
  setTally(counts: number[]): void {
    const target = this.openPollTarget()
    if (!target) return
    if (target.kind === "site")
      this.sim.votes[target.id] = { stop: counts[0] ?? 0, skip: counts[1] ?? 0 }
    else this.sim.tallies[targetKey(target)] = counts
    this.after(true)
  }

  /** The open poll's option labels and counts. */
  openPollCounts(): { labels: string[]; counts: number[] } | null {
    const open = this.sim.polls[0]
    return open ? { labels: open.options, counts: this.sim.countsFor(open.target) } : null
  }

  /** The map's layers and whether each is unlocked (ADR 0222). */
  /** The trip's maps (ADR 0227) and whether using one now would unlock anything. */
  tripMaps(): { shortId: string; name: string; icon: string; usable: boolean }[] {
    return (this.sim.map.maps ?? []).map((item) => {
      const shortId = tripMapItemShortId(item.id)
      return {
        shortId,
        name: item.name,
        icon: item.icon,
        usable: layersToUnlock(this.state, this.sim.map, shortId).length > 0,
      }
    })
  }

  useTripMap(shortId: string, who: SimTraveler = SIM_TRAVELER): boolean {
    return this.after(this.sim.apply(openTripMap(shortId, who)))
  }

  layers(): { id: string; name: string; icon: string; unlocked: boolean }[] {
    return (this.sim.map.layers ?? []).map((layer) => ({
      id: layer.id,
      name: layer.name,
      icon: layer.icon,
      unlocked: this.state.layers[layer.id]?.phase === "unlocked",
    }))
  }

  /** The trip's key items (ADR 0230) and whether the van holds each. */
  keyItems(): { id: string; name: string; icon: string; held: boolean }[] {
    return (this.sim.map.keyItems ?? []).map((key) => ({
      id: key.id,
      name: key.name,
      icon: key.icon,
      held: this.state.keyItems[key.id] !== undefined,
    }))
  }

  /** Put a key item in the van or take it out, as the host would. */
  toggleKeyItem(keyId: string): boolean {
    return this.after(this.sim.setKeyItem(keyId, this.state.keyItems[keyId] === undefined))
  }

  /** Unlock or lock a layer as the host would. */
  toggleLayer(layerId: string): boolean {
    const unlocked = this.state.layers[layerId]?.phase === "unlocked"
    return this.after(
      this.sim.apply(
        dispatch({ type: unlocked ? "LAYER_LOCK" : "LAYER_UNLOCK", layerId, by: { kind: "host" } }),
      ),
    )
  }

  /** A voluntary pledge; settles the fund once the goal is met. */
  pledge(amount: number, who: SimTraveler = SIM_TRAVELER): boolean {
    const fund = this.state.fund
    if (!fund || fund.mode !== "voluntary" || !(amount > 0)) return false
    this.sim.pledge(who.userId, Math.floor(amount))
    return this.after(true)
  }

  poolRaised(): number {
    return this.sim.pledges.reduce((sum, p) => sum + p.amount, 0)
  }

  /** Consumables that end the current incident step. */
  incidentItems(): SimIncidentItem[] {
    const incident = this.state.incident
    const step = incident?.steps[incident.step]
    if (!incident || !step) return []
    if (step.kind !== "window" && step.kind !== "slow") return []
    return (step.resolvesWith ?? []).flatMap((shortId) => {
      const item = vanConsumable(shortId)
      return item ? [{ shortId, name: item.name, emoji: item.emoji }] : []
    })
  }

  useItem(shortId: string, who: SimTraveler = SIM_TRAVELER): boolean {
    return this.after(this.sim.apply(useIncidentItem(shortId, who)))
  }

  triggerIncident(incident: TriggerableIncidentId): boolean {
    return this.after(this.sim.apply(triggerIncident(incident)))
  }

  skipIncidentStep(): boolean {
    const step = this.state.incident?.steps[this.state.incident.step]
    if (step?.kind === "fund") return this.after(this.sim.waiveFund())
    return this.after(this.sim.apply(skipIncidentStep))
  }

  endTrip(): boolean {
    return this.after(this.sim.apply(endTrip))
  }

  incidentName(): string | null {
    const incident = this.state.incident
    return incident ? incident.name : null
  }

  /** The plugin store payload, frozen onto the wall clock for the Room UI. */
  storePayload(wallNow = this.clock()): Record<string, unknown> {
    const { sim } = this
    const fund = sim.state.fund
    const raised = this.poolRaised()
    const built = buildTripStore(sim.state, sim.map, sim.current, sim.now, {
      costScale: sim.costScale,
      ...(fund?.mode === "voluntary" ? { poolRaised: raised } : {}),
      log: sim.log,
    })
    const status = buildStatusLines(sim.state, sim.map, built)
    let tripPool = null
    if (fund?.mode === "voluntary" && sim.state.status === "driving") {
      const pool: EscrowPoolState = {
        id: fund.id,
        title: fundPoolTitle(fund, sim.map),
        goal: fund.cost,
        openedAt: fund.openedAt - sim.now + wallNow,
        closesAt: null,
        status: "open",
        raised,
        pledges: sim.pledges.map((p, i) => ({
          id: `${fund.id}:${i}`,
          userId: p.userId,
          username: p.name,
          amount: p.amount,
          at: wallNow,
        })),
      }
      tripPool = poolCardView(pool, fund, sim.map)
    }
    return {
      tripActive: true,
      trip: freezeStoreForRoom(built, sim.now, wallNow),
      tripPool,
      tripPoolOpen: tripPool?.open === true,
      ...status,
    }
  }

  snapshot(): TripSimSnapshot {
    return {
      roomId: this.roomId,
      version: this.version,
      runId: this.runId,
      store: this.storePayload(),
      messages: this.messages,
      poll: this.poll,
      lastClosedPoll: this.lastClosedPoll,
    }
  }

  /** Turn new effects into chat lines and keep the room poll in step with the sim's. */
  private after(changed: boolean): boolean {
    const fresh = this.sim.effects.slice(this.effectCursor)
    this.effectCursor = this.sim.effects.length
    for (const { effect, recipients } of fresh) {
      if (this.shops && this.runShopEffect(effect)) continue
      const at = Math.max(this.lastMessageAt + 1, this.clock())
      const message =
        effect.type === "open-shop"
          ? this.shopChat(effect.siteId, at)
          : effect.type === "give-items"
            ? giveItemsToChat(effect, recipients ?? [], simItem(this.sim.map, effect.item), at)
            : effectToChat(effect, at)
      if (!message) continue
      this.lastMessageAt = at
      this.messages = [...this.messages, message]
    }
    this.syncPoll()
    if (changed || fresh.length > 0) this.version++
    return changed
  }

  /**
   * Stands in for Item Shops opening the stop's round (ADR 0221 approximates
   * shops): the shop's opening message, as the room posts it. Nothing when it
   * has none.
   */
  private shopChat(siteId: string, at: number): ChatMessage | null {
    const site = this.sim.map.sites.find((s) => s.id === siteId)
    const opening = site?.shop?.openingMessage
    const facts = conditionFacts(this.sim.state)
    if (!site || !siteShopRequest(site, facts) || !opening) return null
    return systemChat(opening, { type: "alert", status: "info", title: siteShopTitle(site) }, at)
  }

  /** Hand shop effects to the real shops; true when handled. */
  private runShopEffect(effect: TripEffect): boolean {
    if (effect.type === "close-shop") {
      this.shops!.close(effect.scopeId)
      if (this.openShopScopeId === effect.scopeId) this.openShopScopeId = null
      return true
    }
    if (effect.type !== "open-shop") return false
    const site = this.sim.map.sites.find((s) => s.id === effect.siteId)
    const request = site
      ? siteOpenRoomShopRequest(site, effect.scopeId, conditionFacts(this.sim.state))
      : null
    if (request) {
      this.shops!.open(request)
      this.openShopScopeId = effect.scopeId
    }
    return true
  }

  /** Close the round this run opened (unloading or replacing the run). */
  closeOpenShop(): void {
    if (!this.shops || !this.openShopScopeId) return
    this.shops.close(this.openShopScopeId)
    this.openShopScopeId = null
  }

  private syncPoll(): void {
    const open = this.sim.polls[0] ?? null
    if (this.openPoll && this.openPoll.pollId !== open?.pollId) {
      const closedAt = this.clock()
      const closing = this.poll
      if (closing) {
        const counts = this.sim.countsFor(this.openPoll.target)
        this.lastClosedPoll = {
          poll: { ...closing, status: "closed", closedAt },
          results: tally(closing, counts, closedAt),
        }
      }
      this.poll = null
      this.openPoll = null
    }
    if (open && !this.openPoll) {
      this.openPoll = open
      this.poll = this.buildPoll(open)
    } else if (open && this.poll) {
      this.poll = this.buildPoll(open, this.poll.publishedAt)
    }
  }

  private buildPoll(open: OpenPoll, publishedAt = this.clock()): Poll | null {
    const pollId = `${this.runId}:${open.pollId}`
    return {
      id: pollId,
      roomId: this.roomId,
      question: open.question,
      options: open.options.map((label, i) => ({
        id: `${pollId}:${open.optionKeys[i] ?? i}`,
        label,
      })),
      status: "open",
      settings: { hideRunningTotal: false },
      createdAt: publishedAt,
      createdBy: SIM_POLL_CREATOR,
      publishedAt,
      closedAt: null,
      // The designer closes it by stepping; the room must not expire it.
      closesAt: null,
      ...(open.presentation ? { presentation: open.presentation } : {}),
    }
  }
}
