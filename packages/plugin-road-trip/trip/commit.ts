import type { TripMap } from "@repo/road-trip-map"
import { nextLeg, PARKED_AT_START, project, ratesChanged, type Leg, type LegReason } from "./ledger"
import { currentRates, type TripLogEntry, type TripLogEvent, type TripState } from "./state"
import type { Transition, TripEffect } from "./transitions"

export type CommitResult = {
  /** Leg to append, when the rates changed. */
  appended: Leg | null
  /** The leg in force after the commit. */
  current: Leg
  log: TripLogEntry[]
}

function legReason(prev: Leg | null, mph: number, log: TripLogEvent[]): LegReason {
  if (!prev || log.some((e) => e.kind === "departed")) return "start"
  if (log.some((e) => e.kind === "arrived" || e.kind === "late")) return "arrive"
  return mph < prev.mph ? "blocker-on" : "blocker-off"
}

/**
 * Derive rates from the saved state, start a new leg only when they changed,
 * and stamp log entries with the time and mile.
 */
export function commitTransition(
  saved: TripState,
  prevLeg: Leg | null,
  events: TripLogEvent[],
  now: number,
): CommitResult {
  const rates = currentRates(saved, now)
  const base = prevLeg ?? null
  let current = base ?? PARKED_AT_START
  let appended: Leg | null = null
  if (saved.status !== "loaded" && ratesChanged(base, rates)) {
    appended = nextLeg(base, now, rates, legReason(base, rates.mph, events))
    current = appended
  }
  const mile = Math.min(saved.routeMiles, project(current, now).mile)
  return { appended, current, log: events.map((event) => ({ ...event, at: now, mile })) }
}

export type AppliedTransition = {
  /** Next state: version bumped, `leg` set to the leg in force. */
  next: TripState
  /** Leg to append to `trip:legs` history, when the rates changed. */
  appended: Leg | null
  log: TripLogEntry[]
  effects: TripEffect[]
}

/**
 * One whole `mutateTrip` step, pure: project the van from the state's own
 * leg, run the transition, and commit the new leg into the same state. Runs
 * inside the CAS, so the leg can never be read from an older state.
 */
export function applyTransition(
  prev: TripState,
  transition: Transition,
  map: TripMap,
  now: number,
): AppliedTransition | null {
  const prevLeg = prev.leg ?? null
  const mile = Math.min(prev.routeMiles, project(prevLeg ?? PARKED_AT_START, now).mile)
  const result = transition(prev, { now, mile, map })
  if (!result) return null
  const next: TripState = { ...result.next, version: prev.version + 1 }
  const committed = commitTransition(next, prevLeg, result.log ?? [], now)
  if (committed.appended) next.leg = committed.appended
  return {
    next,
    appended: committed.appended,
    log: committed.log,
    effects: result.effects ?? [],
  }
}
