import { parseTripMap, SAMPLE_TRIP_MAP, type TripMap, type TripMapInput } from "@repo/road-trip-map"
import { splitProportional } from "@repo/plugin-base"
import { applyTransition } from "./commit"
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
import { advanceIncident, fireScripted } from "./incidents"
import { solveThresholds, type ThresholdRequest } from "./thresholds"
import {
  arriveAtSite,
  deferPoll,
  expireBlocker,
  fuelThreshold,
  markPolling,
  recordLevy,
  resolveFund,
  resolveSkip,
  revealSite,
  type Transition,
  type TripEffect,
} from "./transitions"

export const T0 = Date.parse("2026-10-02T20:00:00.000Z")
export const MIN = 60_000

type OpenPoll = { siteId: string; pollId: string; closesAt: number }

/**
 * In-memory trip runtime for tests: the same transitions, commit, and
 * thresholds as `mutateTrip`, with schedules fired in time order.
 */
export class TripSim {
  map: TripMap
  state: TripState
  legs: Leg[] = []
  log: TripLogEntry[] = []
  effects: { at: number; effect: TripEffect }[] = []
  now = T0
  polls: OpenPoll[] = []
  /** Votes each site's poll receives; missing = no votes. */
  votes: Record<string, SkipVotes> = {}
  /** When true, opening a poll fails as if another poll were open. */
  pollBusy = false
  /** Coin balances of the travelers in the room (automatic levies split these). */
  wallets: Record<string, number> = { ada: 1_000, bo: 100, cy: 0 }
  /** Pledges to the open voluntary pool. */
  pledges: FundPayment[] = []
  /** Session `costScale`, passed to every transition like `mutateTrip`. */
  costScale = 1
  private pollSeq = 0

  constructor(input: TripMapInput = SAMPLE_TRIP_MAP) {
    const parsed = parseTripMap(input)
    if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join("; "))
    this.map = parsed.map
    this.state = createTripState({ map: parsed.map, hash: parsed.hash, loadedAt: T0 }, "trip-1", 7)
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

  apply(transition: Transition): boolean {
    const applied = applyTransition(this.state, transition, this.map, this.now, this.costScale)
    if (!applied) return false
    this.state = applied.next
    if (applied.appended) this.legs.push(applied.appended)
    this.log.push(...applied.log)
    for (const effect of applied.effects) {
      this.effects.push({ at: this.now, effect })
      if (effect.type === "close-poll")
        this.polls = this.polls.filter((p) => p.pollId !== effect.pollId)
      if (effect.type === "open-fund") this.openFund(effect.fund)
    }
    return true
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

  /** Fire schedules and poll closes in time order up to `until`. */
  runUntil(until: number): void {
    for (let guard = 0; guard < 500; guard++) {
      const next = [...this.thresholds()].sort((a, b) => a.at - b.at)[0]
      const poll = [...this.polls].sort((a, b) => a.closesAt - b.closesAt)[0]
      const nextAt = Math.min(next?.at ?? Infinity, poll?.closesAt ?? Infinity)
      if (nextAt > until) break
      this.now = nextAt
      if (poll && poll.closesAt === nextAt) {
        this.polls = this.polls.filter((p) => p !== poll)
        this.apply(
          resolveSkip(poll.siteId, {
            pollId: poll.pollId,
            votes: this.votes[poll.siteId] ?? { stop: 0, skip: 0 },
          }),
        )
        continue
      }
      this.fire(next!)
    }
    this.now = until
  }

  private fire(request: ThresholdRequest): void {
    const siteId = request.payload.siteId!
    switch (request.kind) {
      case "reveal":
        this.apply(revealSite(siteId))
        return
      case "arrive": {
        const poll = this.polls.find((p) => p.siteId === siteId)
        this.apply(
          arriveAtSite(siteId, poll ? { votes: this.votes[siteId] ?? { stop: 0, skip: 0 } } : {}),
        )
        return
      }
      case "incident":
        this.apply(advanceIncident(request.payload.incidentId!, request.payload.step!))
        return
      case "scripted":
        this.apply(fireScripted(request.payload.eventId!))
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
      case "skip-poll":
        this.openPoll(siteId)
        return
    }
  }

  /** Mirrors the plugin's skip-poll handler timing rules. */
  private openPoll(siteId: string): void {
    const arriveAt = this.thresholds().find((t) => t.id === `arrive:${siteId}`)?.at
    if (arriveAt === undefined) return
    if (arriveAt - this.now < 20_000) {
      this.apply(resolveSkip(siteId))
      return
    }
    if (this.pollBusy || this.polls.length > 0) {
      this.apply(deferPoll(siteId, this.now + 5_000))
      return
    }
    const pollId = `poll-${++this.pollSeq}`
    if (this.apply(markPolling(siteId, pollId, ["stop", "skip"]))) {
      this.polls.push({ siteId, pollId, closesAt: Math.min(this.now + 45_000, arriveAt - 10_000) })
    }
  }

  signs(): string[] {
    return this.effects.flatMap(({ effect }) => (effect.type === "sign" ? [effect.title] : []))
  }
}
