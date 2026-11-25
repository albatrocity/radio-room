import type { PollPresentation } from "@repo/types"
import { parseTripMap, SAMPLE_TRIP_MAP, type TripMap, type TripMapInput } from "@repo/road-trip-map"
import { splitProportional } from "@repo/plugin-base"
import { applyTransition, contextFor } from "./commit"
import { dispatch, targetKey, VOTE_SPECS, type OutcomeSource, type VoteTarget } from "./flow"
import { giveItemsRecipients } from "./helpers"
import { PARKED_AT_START, project, type Leg } from "./ledger"
import {
  createTripState,
  tankAt,
  type FundPayment,
  type SkipVotes,
  type TripFund,
  type TripLogEntry,
  type TripState,
} from "./state"
import { advanceIncident, fireBeat, fireScripted } from "./incidents"
import { solveThresholds, type ThresholdRequest } from "./thresholds"
import {
  arriveAtSite,
  expireBlocker,
  fuelThreshold,
  recordLevy,
  resolveFund,
  revealSite,
  type Transition,
  type TripEffect,
} from "./transitions"

export const T0 = Date.parse("2026-10-02T20:00:00.000Z")
export const MIN = 60_000

/** A room poll the sim has open, as `openVote` would create it. */
export type OpenPoll = {
  target: VoteTarget
  /** Set for a site's exit poll. */
  siteId?: string
  pollId: string
  closesAt: number
  question: string
  options: string[]
  /** The vote's option keys, in option order (`stop`/`skip`, `take`/`stay`, choice option ids). */
  optionKeys: string[]
  presentation?: PollPresentation
}

/** A pending schedule (`request`) or an open poll closing. */
export type SimEvent = {
  at: number
  kind: ThresholdRequest["kind"] | "poll-close"
  siteId?: string
  routeId?: string
  target?: VoteTarget
  request?: ThresholdRequest
}

export type SimStep = { event: SimEvent; log: TripLogEntry[]; effects: TripEffect[] }

/**
 * In-memory trip runtime: the same transitions, commit, and thresholds as
 * `mutateTrip`, with schedules fired in time order. Used by tests and the
 * Game Studio trip simulator (ADR 0221).
 */
export class TripSim {
  map: TripMap
  state: TripState
  legs: Leg[] = []
  log: TripLogEntry[] = []
  /** Every effect so far; a `give-items` effect carries who got the item. */
  effects: { at: number; effect: TripEffect; recipients?: string[] }[] = []
  now = T0
  polls: OpenPoll[] = []
  /** Votes each site's poll receives; missing = no votes. */
  votes: Record<string, SkipVotes> = {}
  /** Counts by option order for any other vote (junctions, choices), keyed by `targetKey`. */
  tallies: Record<string, number[]> = {}
  /** When true, opening a poll fails as if another poll were open. */
  pollBusy = false
  /** Coin balances of the travelers in the room (automatic levies split these). */
  wallets: Record<string, number> = { ada: 1_000, bo: 100, cy: 0 }
  /** Pledges to the open voluntary pool. */
  pledges: FundPayment[] = []
  /** Session `costScale`, passed to every transition like `mutateTrip`. */
  costScale = 1
  /** Online travelers a `give-items` effect picks from; null = everyone with a wallet. */
  online: string[] | null = null
  /** Items `give-items` effects handed out (ADR 0230), as the plugin's `giveItem` calls. */
  given: { userId: string; item: string; qty: number }[] = []
  /** Mirrors `inventory.giveItem`; tests may replace it. */
  giveItem = (userId: string, item: string, qty: number): void => {
    this.given.push({ userId, item, qty })
  }
  private pollSeq = 0

  constructor(input: TripMapInput = SAMPLE_TRIP_MAP, start = T0) {
    const parsed = parseTripMap(input)
    if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join("; "))
    this.map = parsed.map
    this.now = start
    this.state = createTripState({ map: parsed.map, hash: parsed.hash, loadedAt: start }, "trip-1", 7)
  }

  /** The leg in force, read from state exactly as `mutateTrip` does. */
  get current(): Leg {
    return this.state.leg ?? PARKED_AT_START
  }

  mile(): number {
    return Math.min(this.state.routeMiles, project(this.current, this.now).mile)
  }

  gallons(): number {
    return tankAt(this.state, this.current, this.now)
  }

  /** The counts `target`'s poll would close with now. */
  countsFor(target: VoteTarget): number[] {
    if (target.kind === "site") {
      const votes = this.votes[target.id] ?? { stop: 0, skip: 0 }
      return [votes.stop, votes.skip]
    }
    const open = this.polls.find((p) => targetKey(p.target) === targetKey(target))
    return this.tallies[targetKey(target)] ?? open?.options.map(() => 0) ?? []
  }

  /** Open polls' counts, as `mutateTrip` reads them before the CAS. */
  private openTallies(): Record<string, number[]> | undefined {
    if (this.polls.length === 0) return undefined
    return Object.fromEntries(this.polls.map((p) => [p.pollId, this.countsFor(p.target)]))
  }

  apply(transition: Transition): boolean {
    const applied = applyTransition(
      this.state,
      transition,
      this.map,
      this.now,
      this.costScale,
      this.openTallies(),
    )
    if (!applied) return false
    this.state = applied.next
    if (applied.appended) this.legs.push(applied.appended)
    this.log.push(...applied.log)
    for (const effect of applied.effects) {
      if (effect.type === "give-items") {
        const recipients = giveItemsRecipients(
          effect,
          this.online ?? Object.keys(this.wallets),
          this.state.seed,
        )
        for (const userId of recipients) this.giveItem(userId, effect.item, effect.qty)
        this.effects.push({ at: this.now, effect, recipients })
        continue
      }
      this.effects.push({ at: this.now, effect })
      if (effect.type === "close-poll")
        this.polls = this.polls.filter((p) => p.pollId !== effect.pollId)
      if (effect.type === "open-fund") this.openFund(effect.fund)
      if (effect.type === "open-vote") this.openPoll(effect.target)
    }
    return true
  }

  /** Put a key item in the van or take it out, as the host (ADR 0230). */
  setKeyItem(keyId: string, held: boolean, by: OutcomeSource = { kind: "host" }): boolean {
    return this.apply(
      dispatch(held ? { type: "KEY_GIVE", key: keyId, by } : { type: "KEY_TAKE", key: keyId, by }),
    )
  }

  /** Mirrors the plugin's `openFund`: levy straight away, or start an empty pool. */
  private openFund(fund: TripFund): void {
    this.pledges = []
    if (fund.mode !== "automatic") return
    const balances = Object.entries(this.wallets).map(([userId, balance]) => ({ userId, balance }))
    const total = balances.reduce((sum, b) => sum + b.balance, 0)
    const paid = splitProportional(fund.cost, balances)
      .filter((share) => share.amount > 0)
      .map((share) => ({ ...share, name: share.userId }))
    for (const payment of paid) this.wallets[payment.userId]! -= payment.amount
    const collected = paid.reduce((sum, p) => sum + p.amount, 0)
    this.apply(
      recordLevy(fund.id, {
        collected,
        payers: paid.length,
        rate: total > 0 ? Math.min(1, fund.cost / total) : 0,
        paid,
      }),
    )
  }

  /** A traveler chips in; settles early once the goal is met, like the plugin. */
  pledge(userId: string, amount: number): void {
    const fund = this.state.fund
    if (!fund || fund.mode !== "voluntary") return
    this.pledges.push({ userId, name: userId, amount })
    if (this.pledges.reduce((sum, p) => sum + p.amount, 0) >= fund.cost) this.settleFund()
  }

  /** Mirrors the plugin's `settleOpenFund`. */
  settleFund(): boolean {
    const fund = this.state.fund
    if (!fund) return false
    if (fund.mode === "automatic") {
      return this.apply(
        resolveFund(fund.id, {
          collected: fund.collected ?? 0,
          payers: fund.payers ?? 0,
          ...(fund.paid ? { paid: fund.paid } : {}),
        }),
      )
    }
    const collected = this.pledges.reduce((sum, p) => sum + p.amount, 0)
    const payers = new Set(this.pledges.map((p) => p.userId)).size
    return this.apply(resolveFund(fund.id, { collected, payers, paid: this.pledges }))
  }

  /** Mirrors the plugin's host waive: refund pledges or levy shares, then resolve as waived. */
  waiveFund(): boolean {
    const fund = this.state.fund
    if (!fund) return false
    const refunds = fund.mode === "voluntary" ? this.pledges : (fund.paid ?? [])
    for (const payment of refunds) this.wallets[payment.userId]! += payment.amount
    this.pledges = []
    return this.apply(resolveFund(fund.id, { collected: 0, payers: 0, waived: true }))
  }

  thresholds(): ThresholdRequest[] {
    return solveThresholds(this.state, this.map, this.current, this.now)
  }

  /** The earliest pending schedule or poll close; poll closes win ties. */
  peekNext(): SimEvent | null {
    const next = [...this.thresholds()].sort((a, b) => a.at - b.at)[0]
    const poll = [...this.polls].sort((a, b) => a.closesAt - b.closesAt)[0]
    if (poll && (!next || poll.closesAt <= next.at)) {
      return {
        at: poll.closesAt,
        kind: "poll-close",
        target: poll.target,
        ...(poll.siteId ? { siteId: poll.siteId } : {}),
        ...(poll.target.kind === "junction" ? { routeId: poll.target.id } : {}),
      }
    }
    if (!next) return null
    return {
      at: next.at,
      kind: next.kind,
      ...(next.payload.siteId ? { siteId: next.payload.siteId } : {}),
      ...(next.payload.routeId ? { routeId: next.payload.routeId } : {}),
      request: next,
    }
  }

  /** Fire schedules and poll closes in time order up to `until`. */
  runUntil(until: number): void {
    for (let guard = 0; guard < 500; guard++) {
      const event = this.peekNext()
      if (!event || event.at > until) break
      this.fireEvent(event)
    }
    this.now = until
  }

  /**
   * Fire exactly one pending event (the one `peekNext` names), moving the
   * clock to it. Returns what fired, with the log and effects it produced.
   */
  stepNext(): SimStep | null {
    const event = this.peekNext()
    if (!event) return null
    const logStart = this.log.length
    const effectStart = this.effects.length
    this.fireEvent(event)
    return {
      event,
      log: this.log.slice(logStart),
      effects: this.effects.slice(effectStart).map(({ effect }) => effect),
    }
  }

  private fireEvent(event: SimEvent): void {
    this.now = Math.max(this.now, event.at)
    if (event.kind === "poll-close") {
      const poll = this.polls.find((p) => targetKey(p.target) === targetKey(event.target!))
      if (!poll) return
      const tally = this.countsFor(poll.target)
      this.polls = this.polls.filter((p) => p !== poll)
      this.apply(dispatch({ type: "VOTE_CLOSED", target: poll.target, pollId: poll.pollId, tally }))
      return
    }
    this.fire(event.request!)
  }

  private fire(request: ThresholdRequest): void {
    const siteId = request.payload.siteId!
    const routeId = request.payload.routeId
    switch (request.kind) {
      case "reveal":
        this.apply(revealSite(siteId))
        return
      case "arrive":
        this.apply(arriveAtSite(siteId))
        return
      case "junction":
        if (routeId) this.apply(dispatch({ type: "JUNCTION_REACH", routeId }))
        return
      case "route-end":
        if (routeId) this.apply(dispatch({ type: "ROUTE_END", routeId }))
        return
      case "incident":
        this.apply(advanceIncident(request.payload.incidentId!, request.payload.step!))
        return
      case "scripted":
        this.apply(fireScripted(request.payload.eventId!))
        return
      case "beat":
        this.apply(fireBeat(request.payload.eventId!, request.payload.beat!))
        return
      case "fuel":
        this.apply(fuelThreshold(request.payload.level!))
        return
      case "expire": {
        const blockerId = request.payload.blockerId!
        const blocker = this.state.blockers.find((b) => b.id === blockerId)
        if (blocker?.kind === "fund") this.settleFund()
        else this.apply(expireBlocker(blockerId))
        return
      }
      case "vote-due":
      case "skip-poll":
        this.openPoll(routeId ? { kind: "junction", id: routeId } : { kind: "site", id: siteId })
        return
    }
  }

  /** Mirrors the plugin's `openVote`: the vote's spec decides copy and timing. */
  openPoll(target: VoteTarget): void {
    const leg = this.state.leg
    if (!leg || this.state.status !== "driving") return
    const ctx = contextFor(this.state, this.map, this.now, this.costScale)
    const spec = VOTE_SPECS[target.kind]
    if (spec.read(this.state, target)?.phase !== "pending" || !spec.votable(this.state, ctx, target)) {
      return
    }
    const prompt = spec.prompt(this.state, ctx, target, leg)
    if (!prompt) return
    if (prompt.kind === "default") {
      this.apply(dispatch({ type: "VOTE_CLOSED", target }))
      return
    }
    if (this.pollBusy || this.polls.length > 0) {
      const retryAt = this.now + 5_000
      this.apply(
        retryAt < prompt.giveUpAt
          ? dispatch({ type: "VOTE_DEFERRED", target, retryAt })
          : dispatch({ type: "VOTE_CLOSED", target }),
      )
      return
    }
    const pollId = `poll-${++this.pollSeq}`
    const optionIds = spec.options(this.state, ctx, target)
    const poll: OpenPoll = {
      target,
      ...(target.kind === "site" ? { siteId: target.id } : {}),
      pollId,
      closesAt: prompt.closesAt,
      question: prompt.question,
      options: prompt.options,
      optionKeys: optionIds,
      ...(prompt.presentation ? { presentation: prompt.presentation } : {}),
    }
    // Listed first: opening the vote can emit effects that read the open polls.
    this.polls.push(poll)
    if (!this.apply(dispatch({ type: "VOTE_OPENED", target, pollId, optionIds }))) {
      this.polls = this.polls.filter((p) => p !== poll)
    }
  }

  signs(): string[] {
    return this.effects.flatMap(({ effect }) => (effect.type === "sign" ? [effect.title] : []))
  }
}
