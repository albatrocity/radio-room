import { parseTripMap, SAMPLE_TRIP_MAP, type TripMap, type TripMapInput } from "@repo/road-trip-map"
import { applyTransition } from "./commit"
import { PARKED_AT_START, project, type Leg } from "./ledger"
import { createTripState, type SkipVotes, type TripLogEntry, type TripState } from "./state"
import { solveThresholds, type ThresholdRequest } from "./thresholds"
import {
  arriveAtSite,
  deferPoll,
  expireBlocker,
  markPolling,
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

  apply(transition: Transition): boolean {
    const applied = applyTransition(this.state, transition, this.map, this.now)
    if (!applied) return false
    this.state = applied.next
    if (applied.appended) this.legs.push(applied.appended)
    this.log.push(...applied.log)
    for (const effect of applied.effects) {
      this.effects.push({ at: this.now, effect })
      if (effect.type === "close-poll")
        this.polls = this.polls.filter((p) => p.pollId !== effect.pollId)
    }
    return true
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
      case "expire":
        this.apply(expireBlocker(request.payload.blockerId!))
        return
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
