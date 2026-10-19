import type { ChatMessage, Poll, PollHistoryEntry } from "@repo/types"
import type { EscrowPoolState } from "@repo/plugin-base"
import {
  INCIDENTS,
  itemsResolving,
  resolveSiteSettings,
  skipPollQuestion,
  vanConsumable,
  type TripMapInput,
  type TripStore,
  type TriggerableIncidentId,
} from "@repo/road-trip-map"
import { poolCardView, skipPollPresentation } from "../presenters"
import { project } from "./ledger"
import { buildStatusLines, buildTripStore } from "./projection"
import type { SkipVotes, TripLogEntry } from "./state"
import { TripSim, type OpenPoll, type SimEvent, type SimStep } from "./testSim"
import { depart, endTrip, gasUrgency, liveSkipDefault, type TripEffect } from "./transitions"
import { skipIncidentStep, triggerIncident, useIncidentItem } from "./incidents"

/**
 * What the Game Studio trip simulator posts to studio-bridge (`POST /trip-sim`,
 * ADR 0213). `store` is the road-trip plugin store payload; `messages` is every
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
    return systemChat(
      effect.body,
      { type: "prose", ...(effect.variant ? { status: effect.variant } : {}) },
      at,
    )
  }
  return null
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
  if (store.live && "endsAt" in store.live && store.live.endsAt !== undefined) {
    frozen.live = { ...store.live, endsAt: shift(store.live.endsAt) }
  }
  const incident = store.vanSheet.incident
  if (incident?.endsAt !== undefined) {
    frozen.vanSheet = { ...store.vanSheet, incident: { ...incident, endsAt: shift(incident.endsAt) } }
  }
  return frozen
}

function tally(pollId: string, votes: SkipVotes, closedAt: number): PollHistoryEntry["results"] {
  const stopId = `${pollId}:stop`
  const skipId = `${pollId}:skip`
  const winners =
    votes.stop === votes.skip ? [] : votes.stop > votes.skip ? [stopId] : [skipId]
  return {
    pollId,
    totalVotes: votes.stop + votes.skip,
    optionTallies: { [stopId]: votes.stop, [skipId]: votes.skip },
    winners,
    closedAt,
  }
}

/**
 * The Game Studio trip simulator (ADR 0213): `TripSim` plus what the Room UI
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

  constructor(input: TripMapInput, options: { roomId: string; clock?: () => number }) {
    this.clock = options.clock ?? Date.now
    this.roomId = options.roomId
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
    return itemsResolving(incident.incident).flatMap((shortId) => {
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
    return incident ? INCIDENTS[incident.incident].name : null
  }

  /** The plugin store payload, frozen onto the wall clock for the Room UI. */
  storePayload(wallNow = this.clock()): Record<string, unknown> {
    const { sim } = this
    const fund = sim.state.fund
    const raised = this.poolRaised()
    const built = buildTripStore(sim.state, sim.map, sim.current, sim.now, {
      costScale: sim.costScale,
      ...(fund?.mode === "voluntary" ? { poolRaised: raised } : {}),
    })
    const status = buildStatusLines(sim.state, sim.map, built)
    let tripPool = null
    if (fund?.mode === "voluntary" && sim.state.status === "driving") {
      const pool: EscrowPoolState = {
        id: fund.id,
        title: fund.purpose === "gas" ? "Gas money" : "Road trip money",
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
    for (const { effect } of fresh) {
      const at = Math.max(this.lastMessageAt + 1, this.clock())
      const message = effectToChat(effect, at)
      if (!message) continue
      this.lastMessageAt = at
      this.messages = [...this.messages, message]
    }
    this.syncPoll()
    if (changed || fresh.length > 0) this.version++
    return changed
  }

  private syncPoll(): void {
    const open = this.sim.polls[0] ?? null
    if (this.openPoll && this.openPoll.pollId !== open?.pollId) {
      const closedAt = this.clock()
      const closing = this.poll
      if (closing) {
        const votes = this.votesFor(this.openPoll.siteId)
        this.lastClosedPoll = {
          poll: { ...closing, status: "closed", closedAt },
          results: tally(closing.id, votes, closedAt),
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
    const { sim } = this
    const site = sim.map.sites.find((s) => s.id === open.siteId)
    if (!site) return null
    const settings = resolveSiteSettings(sim.map, site)
    const projected = project(sim.current, sim.now)
    const fuelCtx = { mile: projected.mile, gallonsUsed: projected.gallonsUsed }
    const urgency = gasUrgency(sim.state, sim.map, site, fuelCtx)
    const question = skipPollQuestion(site, site.mile - projected.mile, settings.mystery)
    const pollId = `${this.runId}:${open.pollId}`
    return {
      id: pollId,
      roomId: this.roomId,
      question: urgency ? `${urgency}. ${question}` : question,
      options: [
        { id: `${pollId}:stop`, label: "Pull off" },
        { id: `${pollId}:skip`, label: "Keep driving" },
      ],
      status: "open",
      settings: { hideRunningTotal: false },
      createdAt: publishedAt,
      createdBy: SIM_POLL_CREATOR,
      publishedAt,
      closedAt: null,
      // The designer closes it by stepping; the room must not expire it.
      closesAt: null,
      presentation: skipPollPresentation(
        site,
        settings.mystery,
        liveSkipDefault(sim.state, sim.map, site, fuelCtx),
        urgency,
      ),
    }
  }
}
