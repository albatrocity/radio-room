import type { PollPresentation } from "@repo/types"
import {
  altRoute,
  resolveSiteSettings,
  skipPollQuestion,
  type IncidentChoice,
} from "@repo/road-trip-map"
import { skipPollPresentation } from "../../../presenters"
import {
  POLL_CLOSE_BEFORE_EXIT_MS,
  POLL_GIVE_UP_BEFORE_EXIT_MS,
  POLL_MIN_DURATION_MS,
  SKIP_POLL_OPTIONS,
} from "../../../types"
import { findSite, pullOffHold, type TransitionContext } from "../../helpers"
import { project, timeToMile, type Leg } from "../../ledger"
import { gasUrgency, liveSkipDefault } from "../../siteRules"
import type { TripState, VoteRuntime } from "../../state"
import type { FlowAcc, FlowEntity } from "../dispatch"
import type { TripFlowEvent, VoteTally, VoteTarget } from "../events"
import { voteMachine, type VoteMachineEvent, type VotePhase } from "../machines"

/**
 * One room poll's lifecycle for every vote target (ADR 0222): a site's exit,
 * a junction, an event choice. What differs per target lives in its
 * `VoteSpec`; adding a kind of vote means adding a spec, not a poll handler.
 */

export type VotePrompt =
  | {
      kind: "open"
      question: string
      options: string[]
      closesAt: number
      /** A 409 retry is pointless after this; the default applies instead. */
      giveUpAt: number
      presentation?: PollPresentation
    }
  /** Too late or too short to poll: the default applies now. */
  | { kind: "default" }

export type VoteSpec = {
  /** The vote's runtime, or undefined when its owner doesn't exist (anymore). */
  read(state: TripState, target: VoteTarget): VoteRuntime | undefined
  write(state: TripState, target: VoteTarget, vote: VoteRuntime): TripState
  /** The owner can hold this vote now (trip driving, owner undecided, on the path). */
  votable(state: TripState, ctx: TransitionContext, target: VoteTarget): boolean
  /** Extra rules for opening a poll (e.g. a pull-off hold). */
  canOpen?(state: TripState, ctx: TransitionContext, target: VoteTarget): boolean
  /** Option keys in poll order. */
  options(state: TripState, ctx: TransitionContext, target: VoteTarget): string[]
  /** The key that wins with no poll, a tie, or no votes. */
  defaultOption(state: TripState, ctx: TransitionContext, target: VoteTarget): string
  /** Copy and timing for the room poll (pure; the plugin does the I/O). Null: not now. */
  prompt(state: TripState, ctx: TransitionContext, target: VoteTarget, leg: Leg): VotePrompt | null
  /** What the owner does now that its poll is open (or closed undecided). */
  opened(target: VoteTarget): TripFlowEvent[]
  cancelled(target: VoteTarget): TripFlowEvent[]
  /** What the owner does with the winner. */
  decided(
    target: VoteTarget,
    winner: string,
    counts: VoteTally | undefined,
    defaulted: boolean,
  ): TripFlowEvent[]
}

function siteOf(target: VoteTarget): string {
  return target.kind === "site" ? target.id : ""
}

function routeOf(target: VoteTarget): string {
  return target.kind === "junction" ? target.id : ""
}

/** Open-poll timing shared by exits and junctions: close before the van gets there. */
function timedPrompt(
  leg: Leg,
  now: number,
  odometer: number,
  durationMs: number,
  copy: Omit<Extract<VotePrompt, { kind: "open" }>, "kind" | "closesAt" | "giveUpAt">,
): VotePrompt | null {
  const arriveAt = timeToMile(leg, odometer)
  if (arriveAt === null) return null
  const closesAt = Math.min(now + durationMs, arriveAt - POLL_CLOSE_BEFORE_EXIT_MS)
  if (arriveAt - now < POLL_GIVE_UP_BEFORE_EXIT_MS || closesAt - now < POLL_MIN_DURATION_MS) {
    return { kind: "default" }
  }
  return { kind: "open", ...copy, closesAt, giveUpAt: arriveAt - POLL_GIVE_UP_BEFORE_EXIT_MS }
}

const siteSpec: VoteSpec = {
  read: (state, target) => {
    const runtime = state.sites[siteOf(target)]
    return runtime ? (runtime.vote ?? { phase: "pending" }) : undefined
  },
  write: (state, target, vote) => {
    const id = siteOf(target)
    const runtime = state.sites[id]
    if (!runtime) return state
    return { ...state, sites: { ...state.sites, [id]: { ...runtime, vote } } }
  },
  votable: (state, ctx, target) => {
    const id = siteOf(target)
    const phase = state.sites[id]?.phase
    return (
      state.status === "driving" &&
      (phase === "ahead" || phase === "polling") &&
      findSite(ctx.map, id) !== undefined
    )
  },
  canOpen: (state, ctx, target) => {
    const site = findSite(ctx.map, siteOf(target))
    return (
      Boolean(site) &&
      state.sites[site!.id]?.phase === "ahead" &&
      !pullOffHold(state, ctx.map, site!)
    )
  },
  options: () => ["stop", "skip"],
  defaultOption: (state, ctx, target) => {
    const site = findSite(ctx.map, siteOf(target))
    return site ? liveSkipDefault(state, ctx.map, site, ctx) : "skip"
  },
  prompt: (state, ctx, target, leg) => {
    const site = findSite(ctx.map, siteOf(target))
    if (!site || state.sites[site.id]?.phase !== "ahead" || leg.mph <= 0) return null
    if (pullOffHold(state, ctx.map, site)) return null
    const settings = resolveSiteSettings(ctx.map, site)
    const projected = project(leg, ctx.now)
    const fuelCtx = { mile: projected.mile, gallonsUsed: projected.gallonsUsed }
    const urgency = gasUrgency(state, ctx.map, site, fuelCtx)
    const question = skipPollQuestion(site, site.mile - projected.mile, settings.mystery)
    return timedPrompt(leg, ctx.now, site.mile, settings.pollDurationMs, {
      question: urgency ? `${urgency}. ${question}` : question,
      options: SKIP_POLL_OPTIONS.map((o) => o.label),
      presentation: skipPollPresentation(
        site,
        settings.mystery,
        liveSkipDefault(state, ctx.map, site, fuelCtx),
        urgency,
      ),
    })
  },
  opened: (target) => [{ type: "SITE_POLL", siteId: siteOf(target), open: true }],
  cancelled: (target) => [{ type: "SITE_POLL", siteId: siteOf(target), open: false }],
  decided: (target, winner, counts, defaulted) => [
    {
      type: "SITE_DECIDE",
      siteId: siteOf(target),
      decision: winner === "stop" ? "stop" : "skip",
      ...(counts ? { votes: { stop: counts[0] ?? 0, skip: counts[1] ?? 0 } } : {}),
      defaulted,
    },
  ],
}

const JUNCTION_OPTIONS = { take: "Take it", stay: "Stay on the road" } as const

const junctionSpec: VoteSpec = {
  read: (state, target) => {
    const runtime = state.junctions[routeOf(target)]
    return runtime ? (runtime.vote ?? { phase: "pending" }) : undefined
  },
  write: (state, target, vote) => {
    const id = routeOf(target)
    const runtime = state.junctions[id]
    if (!runtime) return state
    return { ...state, junctions: { ...state.junctions, [id]: { ...runtime, vote } } }
  },
  votable: (state, ctx, target) => {
    const id = routeOf(target)
    const phase = state.junctions[id]?.phase
    const route = altRoute(ctx.source, id)
    return (
      state.status === "driving" &&
      (phase === "ahead" || phase === "polling") &&
      route?.entry.kind === "vote" &&
      ctx.path.forks.some((fork) => fork.routeId === id)
    )
  },
  options: () => ["take", "stay"],
  defaultOption: (_state, ctx, target) => {
    const route = altRoute(ctx.source, routeOf(target))
    return route?.entry.kind === "vote" ? route.entry.default : "stay"
  },
  prompt: (state, ctx, target, leg) => {
    const id = routeOf(target)
    const route = altRoute(ctx.source, id)
    const fork = ctx.path.forks.find((f) => f.routeId === id)
    if (!route || route.entry.kind !== "vote" || !fork || leg.mph <= 0) return null
    if (state.junctions[id]?.phase !== "ahead") return null
    const mystery = route.entry.mystery === true
    const projected = project(leg, ctx.now)
    const miles = Math.max(1, Math.round(fork.odometer - projected.mile))
    const question =
      route.entry.question ??
      (mystery
        ? "A turn-off up ahead. Take it?"
        : `${route.name} in ${miles} mile${miles === 1 ? "" : "s"}: take it?`)
    const durationMs = ctx.source.tuning.skipPoll.durationSec * 1000
    return timedPrompt(leg, ctx.now, fork.odometer, durationMs, {
      question,
      options: [JUNCTION_OPTIONS.take, JUNCTION_OPTIONS.stay],
      presentation: {
        theme: "road-trip",
        variant: "info",
        eyebrow: "JUNCTION",
        headline: mystery ? "A TURN-OFF AHEAD" : route.name.toUpperCase().slice(0, 80),
        icon: mystery ? "❓" : (route.icon ?? "🛣️"),
        footnote:
          route.entry.default === "take" ? "No votes = take it" : "No votes = stay on the road",
        resultsInChat: true,
      },
    })
  },
  opened: (target) => [{ type: "JUNCTION_POLL", routeId: routeOf(target), open: true }],
  cancelled: (target) => [{ type: "JUNCTION_POLL", routeId: routeOf(target), open: false }],
  decided: (target, winner, counts, defaulted) => [
    {
      type: "JUNCTION_DECIDE",
      routeId: routeOf(target),
      decision: winner === "take" ? "take" : "stay",
      ...(counts ? { votes: [counts[0] ?? 0, counts[1] ?? 0] as [number, number] } : {}),
      defaulted,
    },
  ],
}

/** The active incident's choice for `target`, when it's still the current step. */
export function choiceFor(state: TripState, target: VoteTarget): IncidentChoice | undefined {
  if (target.kind !== "choice") return undefined
  const incident = state.incident
  if (!incident || incident.id !== target.incidentId || incident.step !== target.step)
    return undefined
  const step = incident.steps[incident.step]
  if (step?.kind === "choice") return step.choice
  if (step?.kind === "slow") return step.choice
  return undefined
}

const choiceSpec: VoteSpec = {
  read: (state, target) => {
    if (!choiceFor(state, target)) return undefined
    return state.incident?.choice?.vote ?? { phase: "pending" }
  },
  write: (state, target, vote) => {
    const incident = state.incident
    if (!incident || !choiceFor(state, target)) return state
    return { ...state, incident: { ...incident, choice: { ...incident.choice, vote } } }
  },
  votable: (state, _ctx, target) =>
    state.status === "driving" &&
    choiceFor(state, target) !== undefined &&
    state.incident?.choice?.winner === undefined,
  options: (state, _ctx, target) => choiceFor(state, target)?.options.map((o) => o.id) ?? [],
  defaultOption: (state, _ctx, target) => choiceFor(state, target)?.default ?? "",
  prompt: (state, ctx, target) => {
    const choice = choiceFor(state, target)
    const incident = state.incident
    if (!choice || !incident || state.incident?.choice?.vote.phase !== "pending") return null
    const closesAt = incident.stepStartedAt + choice.ms
    if (closesAt - ctx.now < POLL_MIN_DURATION_MS) return { kind: "default" }
    return {
      kind: "open",
      question: choice.question,
      options: choice.options.map((o) => o.label),
      closesAt,
      giveUpAt: closesAt - POLL_MIN_DURATION_MS,
      presentation: {
        theme: "road-trip",
        variant: "warning",
        headline: incident.name.toUpperCase().slice(0, 80),
        icon: incident.icon,
        footnote:
          `No votes = ${choice.options.find((o) => o.id === choice.default)?.label ?? choice.default}`.slice(
            0,
            120,
          ),
        resultsInChat: true,
      },
    }
  },
  opened: () => [],
  cancelled: () => [],
  decided: (target, winner, counts, defaulted) =>
    target.kind === "choice"
      ? [
          {
            type: "CHOICE_DECIDED",
            incidentId: target.incidentId,
            step: target.step,
            winner,
            ...(counts ? { votes: counts } : {}),
            defaulted,
          },
        ]
      : [],
}

export const VOTE_SPECS: Record<VoteTarget["kind"], VoteSpec> = {
  site: siteSpec,
  junction: junctionSpec,
  choice: choiceSpec,
}

export function targetKey(target: VoteTarget): string {
  return target.kind === "choice"
    ? `choice:${target.incidentId}:${target.step}`
    : `${target.kind}:${target.id}`
}

export function parseTargetKey(key: string): VoteTarget | null {
  const [kind, id, step] = key.split(":")
  if (kind === "site" || kind === "junction") return id ? { kind, id } : null
  if (kind === "choice" && id && step !== undefined) {
    return { kind, incidentId: id, step: Number(step) }
  }
  return null
}

/** Every vote with a room poll open, in a stable order (sites, junctions, the incident's choice). */
export function openVoteTargets(state: TripState): VoteTarget[] {
  const targets: VoteTarget[] = []
  for (const [id, runtime] of Object.entries(state.sites)) {
    if (runtime.vote?.phase === "open") targets.push({ kind: "site", id })
  }
  for (const [id, runtime] of Object.entries(state.junctions ?? {})) {
    if (runtime.vote?.phase === "open") targets.push({ kind: "junction", id })
  }
  const incident = state.incident
  if (incident?.choice?.vote.phase === "open") {
    targets.push({ kind: "choice", incidentId: incident.id, step: incident.step })
  }
  return targets
}

/** The vote a room poll belongs to, with its option ids. */
export function findVoteByPoll(
  state: TripState,
  pollId: string,
): { target: VoteTarget; vote: VoteRuntime } | null {
  for (const target of openVoteTargets(state)) {
    const vote = VOTE_SPECS[target.kind].read(state, target)
    if (vote?.pollId === pollId) return { target, vote }
  }
  return null
}

/** Highest count wins; a tie at the top, no votes, or no poll falls to `fallback`. */
export function decide(
  keys: string[],
  counts: VoteTally | undefined,
  fallback: string,
): { winner: string; defaulted: boolean } {
  if (!counts || counts.length === 0) return { winner: fallback, defaulted: true }
  const top = Math.max(...keys.map((_, i) => counts[i] ?? 0))
  const leaders = keys.filter((_, i) => (counts[i] ?? 0) === top)
  if (leaders.length !== 1) return { winner: fallback, defaulted: true }
  return { winner: leaders[0]!, defaulted: false }
}

function targetOf(event: TripFlowEvent): VoteTarget | null {
  switch (event.type) {
    case "VOTE_OPENED":
    case "VOTE_DEFERRED":
    case "VOTE_CLOSED":
    case "VOTE_CANCEL":
      return event.target
    default:
      return null
  }
}

function patchVote(acc: FlowAcc, target: VoteTarget, patch: Partial<VoteRuntime>): FlowAcc {
  const spec = VOTE_SPECS[target.kind]
  const vote = spec.read(acc.next, target)
  if (!vote) return acc
  const next: VoteRuntime = { ...vote, ...patch }
  for (const key of Object.keys(patch) as (keyof VoteRuntime)[]) {
    if (patch[key] === undefined) delete next[key]
  }
  return { ...acc, next: spec.write(acc.next, target, next) }
}

export const voteEntity: FlowEntity<VotePhase, VoteMachineEvent> = {
  machine: voteMachine,
  handles: ["VOTE_OPENED", "VOTE_DEFERRED", "VOTE_CLOSED", "VOTE_CANCEL"],
  target: (event) => {
    const target = targetOf(event)
    return target ? targetKey(target) : null
  },
  read: (state, key) => {
    const target = parseTargetKey(key)
    return target ? VOTE_SPECS[target.kind].read(state, target)?.phase : undefined
  },
  write: (state, key, phase) => {
    const target = parseTargetKey(key)
    if (!target) return state
    const spec = VOTE_SPECS[target.kind]
    const vote = spec.read(state, target)
    return vote ? spec.write(state, target, { ...vote, phase }) : state
  },
  interpret: (event, _key, state, ctx) => {
    const target = targetOf(event)
    if (!target) return null
    const spec = VOTE_SPECS[target.kind]
    const vote = spec.read(state, target)
    if (!vote) return null
    switch (event.type) {
      case "VOTE_OPENED":
        if (!spec.votable(state, ctx, target)) return null
        if (spec.canOpen && !spec.canOpen(state, ctx, target)) return null
        return { type: "OPEN" }
      case "VOTE_DEFERRED":
        return spec.votable(state, ctx, target) ? { type: "DEFER" } : null
      case "VOTE_CLOSED":
        if (!spec.votable(state, ctx, target)) return null
        if (event.pollId !== undefined && vote.pollId !== event.pollId) return null
        return { type: "DECIDE" }
      case "VOTE_CANCEL":
        return { type: "CANCEL" }
      default:
        return null
    }
  },
  onEnter: {
    open: (acc, { event, emit }) => {
      if (event.type !== "VOTE_OPENED") return acc
      const opened = patchVote(acc, event.target, {
        pollId: event.pollId,
        optionIds: event.optionIds,
        retryAt: undefined,
      })
      return emit(opened, ...VOTE_SPECS[event.target.kind].opened(event.target))
    },
    pending: (acc, { event, from, emit }) => {
      if (event.type === "VOTE_DEFERRED") {
        return patchVote(acc, event.target, { retryAt: event.retryAt })
      }
      if (event.type !== "VOTE_CANCEL" || from !== "open") return acc
      const pollId = VOTE_SPECS[event.target.kind].read(acc.next, event.target)?.pollId
      const closed = patchVote(acc, event.target, { pollId: undefined, optionIds: undefined })
      const withEffect = pollId
        ? { ...closed, effects: [...closed.effects, { type: "close-poll" as const, pollId }] }
        : closed
      return emit(withEffect, ...VOTE_SPECS[event.target.kind].cancelled(event.target))
    },
    decided: (acc, { event, from, ctx, emit }) => {
      if (event.type !== "VOTE_CLOSED") return acc
      const spec = VOTE_SPECS[event.target.kind]
      const vote = spec.read(acc.next, event.target)
      const pollId = vote?.pollId
      let next = acc
      // Closing it here (arrival, tow, timeout) rather than on the poll's own close.
      if (from === "open" && pollId && event.pollId === undefined) {
        next = { ...next, effects: [...next.effects, { type: "close-poll", pollId }] }
      }
      const counts = event.tally ?? (from === "open" && pollId ? ctx.tallies?.[pollId] : undefined)
      const keys = spec.options(acc.next, ctx, event.target)
      const { winner, defaulted } = decide(
        keys,
        counts,
        spec.defaultOption(acc.next, ctx, event.target),
      )
      next = patchVote(next, event.target, {
        pollId: undefined,
        optionIds: undefined,
        retryAt: undefined,
      })
      return emit(next, ...spec.decided(event.target, winner, counts, defaulted))
    },
  },
}
