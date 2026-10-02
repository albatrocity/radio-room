import type { TripMap } from "@repo/road-trip-map"
import { resolveSiteSettings, sortedSites } from "@repo/road-trip-map"
import { project, timeToMile, type Leg } from "./ledger"
import type { TripState } from "./state"
import { ARRIVAL_MILE_EPSILON } from "./transitions"

export type ThresholdKind = "reveal" | "skip-poll" | "arrive" | "expire"

export type ThresholdRequest = {
  id: string
  kind: ThresholdKind
  at: number
  payload: { tripId: string; siteId?: string; blockerId?: string }
}

/** Fixed schedule id for a threshold: one per kind and site (or blocker). */
export function thresholdId(kind: ThresholdKind, target: string): string {
  return `${kind}:${target}`
}

/** Never arm in the past; durable schedules fire "soon" instead. */
const MIN_DELAY_MS = 500

/**
 * Solve every threshold from the current leg (ADR 0200). Re-solved after every
 * mutation; ids are fixed so re-arming replaces, and ids missing from the new
 * set are cancelled by the caller.
 */
export function solveThresholds(
  state: TripState,
  map: TripMap,
  current: Leg,
  now: number,
): ThresholdRequest[] {
  const out: ThresholdRequest[] = []
  const tripId = state.tripId
  const soon = now + MIN_DELAY_MS

  for (const blocker of state.blockers) {
    if (blocker.until === undefined) continue
    out.push({
      id: thresholdId("expire", blocker.id),
      kind: "expire",
      at: Math.max(blocker.until, soon),
      payload: { tripId, blockerId: blocker.id },
    })
  }

  if (state.status !== "driving" || current.mph <= 0) return out

  const mile = project(current, now).mile
  for (const site of sortedSites(map)) {
    const runtime = state.sites[site.id]
    if (!runtime) continue
    if (runtime.phase === "skipped" || runtime.phase === "visited" || runtime.phase === "parked") {
      continue
    }

    const solved = timeToMile(current, site.mile)
    const arriveAt = solved ?? (site.mile <= mile + ARRIVAL_MILE_EPSILON ? soon : null)
    if (arriveAt === null) continue
    out.push({
      id: thresholdId("arrive", site.id),
      kind: "arrive",
      at: Math.max(arriveAt, soon),
      payload: { tripId, siteId: site.id },
    })

    const settings = resolveSiteSettings(map, site)
    let pollAt: number | null = null
    if (settings.optional && runtime.phase === "ahead") {
      pollAt = Math.max(arriveAt - settings.pollLeadMs, runtime.pollRetryAt ?? 0, soon)
      out.push({
        id: thresholdId("skip-poll", site.id),
        kind: "skip-poll",
        at: pollAt,
        payload: { tripId, siteId: site.id },
      })
    }

    if (!runtime.revealed) {
      const candidates: number[] = []
      if (settings.revealMiles > 0) {
        const revealMile = site.mile - settings.revealMiles
        candidates.push(revealMile <= mile ? soon : (timeToMile(current, revealMile) ?? soon))
      }
      // Reveal strictly before the poll opens so the sign lands first.
      if (pollAt !== null && !settings.mystery) candidates.push(pollAt - 1_000)
      if (candidates.length > 0) {
        out.push({
          id: thresholdId("reveal", site.id),
          kind: "reveal",
          at: Math.max(Math.min(...candidates), soon),
          payload: { tripId, siteId: site.id },
        })
      }
    }
  }
  return out
}
