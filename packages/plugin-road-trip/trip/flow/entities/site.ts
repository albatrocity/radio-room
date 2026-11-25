import type { TripSite } from "@repo/road-trip-map"
import { isDestination, resolveSiteSettings } from "@repo/road-trip-map"
import {
  ARRIVAL_MILE_EPSILON,
  departNarrate,
  departNarrativeCase,
  findSite,
  milesLabel,
  narrativeSounds,
  pullOffHold,
  type TransitionContext,
  type TripEffect,
  visitNarrativeCase,
} from "../../helpers"
import { conditionFacts, type SiteRuntime, type SkipVotes, type TripState } from "../../state"
import { parkAt } from "../../stops"
import type { FlowAcc, FlowEntity } from "../dispatch"
import type { TripFlowEvent } from "../events"
import { siteMachine, type SiteMachineEvent, type SitePhase } from "../machines"

/**
 * A site's lifecycle (ADR 0222): its exit vote, the stop, and being passed,
 * towed past, or bypassed. `revealed` is data, not a phase: SITE_REVEAL
 * updates it without a move.
 */

function siteIdOf(event: TripFlowEvent): string | null {
  return "siteId" in event ? event.siteId : null
}

function patchSite(acc: FlowAcc, id: string, patch: Partial<SiteRuntime>): FlowAcc {
  const runtime = acc.next.sites[id]
  if (!runtime) return acc
  return {
    ...acc,
    next: { ...acc.next, sites: { ...acc.next.sites, [id]: { ...runtime, ...patch } } },
  }
}

/**
 * The van stops here: revealed, `visitedAt`, and the arrival narrative case that
 * holds now (ADR 0230), recorded so every narrator and replay posts the same text.
 */
function markVisited(acc: FlowAcc, ctx: TransitionContext, site: TripSite): FlowAcc {
  const narrativeCase = visitNarrativeCase(site, conditionFacts(acc.next))
  return patchSite(acc, site.id, {
    revealed: true,
    visitedAt: ctx.now,
    ...(narrativeCase !== undefined ? { narrativeCase } : {}),
  })
}

/** Mark a site revealed; an optional, non-mystery site ahead gets a "Coming up" sign. */
function reveal(acc: FlowAcc, ctx: TransitionContext, site: TripSite): FlowAcc {
  const runtime = acc.next.sites[site.id]
  if (!runtime || runtime.revealed) return acc
  const next = patchSite(acc, site.id, { revealed: true })
  const effects: TripEffect[] = []
  const settings = resolveSiteSettings(ctx.map, site)
  if (settings.optional && !settings.mystery && site.mile > ctx.mile) {
    effects.push({
      type: "sign",
      variant: "info",
      icon: site.icon,
      title: `Coming up: ${site.name}`,
      body: `${milesLabel(site.mile - ctx.mile)} · ${site.description}`,
    })
  }
  return {
    next: next.next,
    log: [...next.log, { kind: "site", siteId: site.id, name: site.name, phase: "revealed" }],
    effects: [...next.effects, ...effects],
  }
}

/** The exit poll's outcome as a road sign; the poll card leaves on close (`resultsInChat`). */
function pollResultSign(
  site: TripSite,
  mystery: boolean,
  decision: "stop" | "skip",
  votes: SkipVotes,
): TripEffect {
  const stop = decision === "stop"
  const outcome = stop ? "The van pulls off." : "The van stays on the highway."
  const tally = stop ? `${votes.stop}–${votes.skip}` : `${votes.skip}–${votes.stop}`
  const body =
    votes.stop + votes.skip === 0
      ? `No votes. ${outcome}`
      : votes.stop === votes.skip
        ? `Tied ${tally}. ${outcome}`
        : `The room voted ${tally} to ${stop ? "stop" : "keep going"}.`
  if (stop) {
    return {
      type: "sign",
      variant: "info",
      icon: "CornerUpRight",
      title: mystery ? "Taking the exit" : `Taking the exit for ${site.name}`,
      body,
    }
  }
  return {
    type: "sign",
    variant: "info",
    icon: "MoveUp",
    title: mystery ? "Kept driving" : `Kept driving past ${site.name}`,
    body,
  }
}

/** Record a decision on the site and post its result sign when a poll ran. */
function recordDecision(
  acc: FlowAcc,
  ctx: TransitionContext,
  site: TripSite,
  event: Extract<TripFlowEvent, { type: "SITE_DECIDE" }>,
): FlowAcc {
  const patch: Partial<SiteRuntime> = { defaulted: event.defaulted }
  if (event.votes) patch.votes = event.votes
  const next = patchSite(acc, site.id, patch)
  if (!event.votes) return next
  const mystery = resolveSiteSettings(ctx.map, site).mystery
  return {
    ...next,
    effects: [...next.effects, pollResultSign(site, mystery, event.decision, event.votes)],
  }
}

/** Arrival rules that hold whatever the site's phase. */
function canArrive(state: TripState, ctx: TransitionContext, site: TripSite): boolean {
  if (state.status !== "driving") return false
  if (ctx.mile < site.mile - ARRIVAL_MILE_EPSILON) return false
  // Already parked at another site: this arrival waits. The van is stopped,
  // so the threshold re-arms when the park ends and the site is reached then.
  if (state.blockers.some((b) => b.kind === "parked" && b.siteId !== site.id)) return false
  // A tow carries the van past sites; the tow's own arrival handles the Mechanic.
  if (state.incident?.steps[state.incident.step]?.kind === "tow") return false
  return true
}

export const siteEntity: FlowEntity<SitePhase, SiteMachineEvent> = {
  machine: siteMachine,
  handles: [
    "SITE_REVEAL",
    "SITE_ARRIVE",
    "SITE_POLL",
    "SITE_LEAVE",
    "SITE_DECIDE",
    "SITE_BYPASS",
    "SITE_TOW_PAST",
    "SITE_TOWED_IN",
  ],
  target: siteIdOf,
  read: (state, id) => state.sites[id]?.phase,
  write: (state, id, phase) => {
    const runtime = state.sites[id]
    if (!runtime) return state
    return { ...state, sites: { ...state.sites, [id]: { ...runtime, phase } } }
  },
  interpret: (event, id, state, ctx) => {
    const runtime = state.sites[id]!
    switch (event.type) {
      case "SITE_REVEAL": {
        if (state.status !== "driving" || runtime.revealed) return null
        const site = findSite(ctx.map, id)
        if (!site) return null
        if (event.reason !== "guide" && pullOffHold(state, ctx.map, site)) return null
        return { update: (acc) => reveal(acc, ctx, site) }
      }
      case "SITE_ARRIVE": {
        const site = findSite(ctx.map, id)
        if (!site || !canArrive(state, ctx, site)) return null
        if (isDestination(site)) return { type: "FINISH" }
        if (runtime.phase === "stopping") return { type: "PARK" }
        if ((runtime.phase === "ahead" || runtime.phase === "polling") && !event.afterDecision) {
          // Undecided at the exit: the vote closes (tally or default), then the van arrives.
          return {
            then: [
              { type: "VOTE_CLOSED", target: { kind: "site", id } },
              { type: "SITE_ARRIVE", siteId: id, afterDecision: true },
            ],
          }
        }
        return null
      }
      case "SITE_POLL":
        return event.open ? { type: "POLL_OPENED" } : { type: "POLL_CANCELLED" }
      case "SITE_LEAVE":
        return { type: "LEAVE" }
      case "SITE_DECIDE":
        return event.decision === "stop" ? { type: "STOP" } : { type: "SKIP" }
      case "SITE_BYPASS": {
        const site = ctx.source.sites.find((s) => s.id === id)
        return site && !isDestination(site) ? { type: "BYPASS" } : null
      }
      case "SITE_TOW_PAST": {
        const site = findSite(ctx.map, id)
        return site && !isDestination(site) ? { type: "TOW_PAST" } : null
      }
      case "SITE_TOWED_IN":
        return { type: "TOWED_IN" }
      default:
        return null
    }
  },
  onEnter: {
    polling: (acc, { id, ctx }) => {
      const site = findSite(ctx.map, id)
      if (!site) return acc
      // Normally the reveal fired a second earlier. When both came due at once
      // (e.g. released from a pull-off hold), the poll reveals and signs it.
      const revealed = resolveSiteSettings(ctx.map, site).mystery ? acc : reveal(acc, ctx, site)
      return {
        ...revealed,
        log: [...revealed.log, { kind: "site", siteId: id, name: site.name, phase: "poll" }],
      }
    },
    stopping: (acc, { id, ctx, event }) => {
      const site = findSite(ctx.map, id)
      if (!site || event.type !== "SITE_DECIDE") return acc
      return recordDecision(acc, ctx, site, event)
    },
    skipped: (acc, { id, ctx, event, emit }) => {
      const site = findSite(ctx.map, id) ?? ctx.source.sites.find((s) => s.id === id)
      if (!site) return acc
      if (event.type === "SITE_DECIDE") {
        const decided = recordDecision(acc, ctx, site, event)
        return {
          ...decided,
          log: [
            ...decided.log,
            {
              kind: "site",
              siteId: id,
              name: site.name,
              phase: "skipped",
              ...(event.votes ? { votes: event.votes } : {}),
              defaulted: event.defaulted,
            },
          ],
        }
      }
      // Towed past: its poll closes undecided.
      const cancelled = emit(acc, { type: "VOTE_CANCEL", target: { kind: "site", id } })
      return {
        ...cancelled,
        log: [...cancelled.log, { kind: "site", siteId: id, name: site.name, phase: "skipped" }],
      }
    },
    parked: (acc, { id, ctx, event, from, emit }) => {
      const site = findSite(ctx.map, id)
      const before = acc.next.sites[id]
      if (!site || !before) return acc
      const marked = markVisited(acc, ctx, site)
      const parked =
        event.type === "SITE_ARRIVE" && from === "stopping"
          ? parkAt(marked, ctx, site, {
              wasRevealed: before.revealed,
              ...(before.votes ? { votes: before.votes } : {}),
              ...(before.defaulted !== undefined ? { defaulted: before.defaulted } : {}),
            })
          : marked
      // A visit's outcomes apply once the van is parked (a tow-in counts).
      return site.onVisit?.length
        ? emit(parked, {
            type: "APPLY_OUTCOMES",
            outcomes: site.onVisit,
            source: { kind: "site", id },
          })
        : parked
    },
    visited: (acc, { id, ctx, event, emit }) => {
      // Departure narrative and outcomes apply when the van pulls back onto the
      // road (ADR 0223, 0226). Ending the trip while parked also leaves, after
      // status has left `driving`.
      if (event.type === "SITE_LEAVE") {
        if (acc.next.status !== "driving") return acc
        const site = findSite(ctx.map, id)
        if (!site) return patchSite(acc, id, { leftAt: ctx.now })
        // Checked before `onDepart` runs, like the outcomes' own `when`s (ADR 0230).
        const departCase = departNarrativeCase(site, conditionFacts(acc.next))
        const left = patchSite(acc, id, {
          leftAt: ctx.now,
          ...(departCase !== undefined ? { departNarrativeCase: departCase } : {}),
        })
        const narrative = departNarrate(site, departCase)
        const sounds = narrativeSounds(site, "departure")
        const narrated = {
          ...left,
          effects: [
            ...left.effects,
            ...(narrative ? [narrative] : []),
            ...sounds,
          ],
        }
        return site.onDepart?.length
          ? emit(narrated, {
              type: "APPLY_OUTCOMES",
              outcomes: site.onDepart,
              source: { kind: "site", id },
            })
          : narrated
      }
      if (event.type !== "SITE_ARRIVE") return acc
      const site = findSite(ctx.map, id)
      const before = acc.next.sites[id]
      if (!site || !before) return acc
      const marked = markVisited(acc, ctx, site)
      const logged = before.revealed
        ? marked
        : {
            ...marked,
            log: [
              ...marked.log,
              { kind: "site" as const, siteId: id, name: site.name, phase: "revealed" as const },
            ],
          }
      return emit(logged, { type: "TRIP_ARRIVE", siteId: id })
    },
    bypassed: (acc, { id, ctx, emit }) => {
      const site = ctx.source.sites.find((s) => s.id === id)
      const cancelled = emit(acc, { type: "VOTE_CANCEL", target: { kind: "site", id } })
      if (!site) return cancelled
      return {
        ...cancelled,
        log: [...cancelled.log, { kind: "site", siteId: id, name: site.name, phase: "bypassed" }],
      }
    },
  },
}
