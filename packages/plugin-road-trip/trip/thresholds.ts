import type { TripMap } from "@repo/road-trip-map"
import { resolveSiteSettings, sortedSites } from "@repo/road-trip-map"
import { project, timeToGallonsUsed, timeToMile, type Leg } from "./ledger"
import { currentIncidentStep, isTowing, type FuelLevel, type TripState } from "./state"
import { ARRIVAL_MILE_EPSILON, fuelLine } from "./transitions"

export type ThresholdKind =
  | "reveal"
  | "skip-poll"
  | "arrive"
  | "expire"
  | "fuel"
  | "incident"
  | "scripted"

export type ThresholdPayload = {
  tripId: string
  siteId?: string
  blockerId?: string
  level?: FuelLevel
  incidentId?: string
  step?: number
  eventId?: string
}

export type ThresholdRequest = {
  id: string
  kind: ThresholdKind
  at: number
  payload: ThresholdPayload
}

/** Fixed schedule id for a threshold: one per kind and site (or blocker, step, event). */
export function thresholdId(kind: ThresholdKind, target: string): string {
  return `${kind}:${target}`
}

/** The id target a payload was armed under (the inverse of `solveThresholds`' ids). */
export function thresholdTarget(payload: ThresholdPayload): string | undefined {
  if (payload.incidentId !== undefined) return `${payload.incidentId}:${payload.step ?? 0}`
  return payload.siteId ?? payload.blockerId ?? payload.level ?? payload.eventId
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

  const incident = state.incident
  const step = currentIncidentStep(state)
  if (incident && step && state.status === "driving") {
    let at: number | null = null
    if (step.kind === "tow") {
      const site = map.sites.find((s) => s.id === step.siteId)
      if (site && current.mph > 0) {
        at = timeToMile(current, site.mile) ?? soon
      }
    } else if (incident.stepEndsAt !== undefined) {
      at = incident.stepEndsAt
    }
    if (at !== null) {
      out.push({
        id: thresholdId("incident", `${incident.id}:${incident.step}`),
        kind: "incident",
        at: Math.max(at, soon),
        payload: { tripId, incidentId: incident.id, step: incident.step },
      })
    }
  }

  // A tow carries the van past everything to its Mechanic; only the tow's arrival matters.
  if (state.status !== "driving" || current.mph <= 0 || isTowing(state)) return out

  for (const level of ["low", "empty"] as const) {
    if (state.fuelFlags.includes(level)) continue
    const target = state.lastFill.gallonsUsed + state.lastFill.gallons - fuelLine(state, map, level)
    const at = timeToGallonsUsed(current, target) ?? (current.gpm > 0 ? soon : null)
    if (at === null) continue
    out.push({
      id: thresholdId("fuel", level),
      kind: "fuel",
      at: Math.max(at, soon),
      payload: { tripId, level },
    })
  }

  const mile = project(current, now).mile

  for (const event of map.scriptedEvents ?? []) {
    if (state.scriptedFired.includes(event.id)) continue
    const at =
      event.atMile <= mile + ARRIVAL_MILE_EPSILON ? soon : timeToMile(current, event.atMile)
    if (at === null) continue
    out.push({
      id: thresholdId("scripted", event.id),
      kind: "scripted",
      at: Math.max(at, soon),
      payload: { tripId, eventId: event.id },
    })
  }

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
