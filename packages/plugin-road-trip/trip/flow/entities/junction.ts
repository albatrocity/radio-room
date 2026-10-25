import { altRoute, mileEvents } from "@repo/road-trip-map"
import { ARRIVAL_MILE_EPSILON, type TransitionContext, type TripEffect } from "../../helpers"
import { isTowing, type JunctionRuntime, type TripState } from "../../state"
import type { FlowAcc, FlowEntity } from "../dispatch"
import type { TripFlowEvent } from "../events"
import { junctionMachine, type JunctionMachineEvent, type JunctionPhase } from "../machines"
import { appendLeg, routeName } from "./anchor"

/**
 * A fork's lifecycle (ADR 0222), keyed by the alternate route's id. Until it's
 * decided the path treats it as "stay"; the route's `entry.default` applies
 * only when its vote resolves. A `layer` on the route gates the fork itself.
 */

function routeIdOf(event: TripFlowEvent): string | null {
  return "routeId" in event ? event.routeId : null
}

function patchJunction(acc: FlowAcc, id: string, patch: Partial<JunctionRuntime>): FlowAcc {
  const runtime = acc.next.junctions[id]
  if (!runtime) return acc
  return {
    ...acc,
    next: { ...acc.next, junctions: { ...acc.next.junctions, [id]: { ...runtime, ...patch } } },
  }
}

function forkAhead(ctx: TransitionContext, id: string) {
  return ctx.path.forks.find((fork) => fork.routeId === id)
}

/** A mile event right at the fork fires first: it may divert the van (an event at the fork mile). */
function eventAtFork(state: TripState, ctx: TransitionContext, odometer: number): boolean {
  return mileEvents(ctx.map).some(
    (event) =>
      !state.scriptedFired.includes(event.id) &&
      Math.abs(event.mile - odometer) <= ARRIVAL_MILE_EPSILON,
  )
}

function resultSign(
  name: string,
  icon: string,
  decision: "take" | "stay",
  votes: [number, number],
): TripEffect {
  const [take, stay] = votes
  const tally = decision === "take" ? `${take}–${stay}` : `${stay}–${take}`
  const outcome = decision === "take" ? `The van turns onto ${name}.` : "The van stays on the road."
  const body =
    take + stay === 0
      ? `No votes. ${outcome}`
      : take === stay
        ? `Tied ${tally}. ${outcome}`
        : `The room voted ${tally} to ${decision === "take" ? "take it" : "stay"}.`
  return {
    type: "sign",
    variant: "info",
    icon: decision === "take" ? "CornerUpRight" : "MoveUp",
    title: decision === "take" ? `Taking ${name}` : `Staying on the road`,
    body,
  }
}

export const junctionEntity: FlowEntity<JunctionPhase, JunctionMachineEvent> = {
  machine: junctionMachine,
  handles: ["JUNCTION_POLL", "JUNCTION_DECIDE", "JUNCTION_REACH", "JUNCTION_TOW_SETTLE", "DIVERT"],
  target: routeIdOf,
  read: (state, id, ctx) =>
    state.junctions[id]?.phase ?? (altRoute(ctx.source, id) ? "ahead" : undefined),
  write: (state, id, phase) => ({
    ...state,
    junctions: { ...state.junctions, [id]: { ...state.junctions[id], phase } },
  }),
  interpret: (event, id, state, ctx) => {
    const phase = state.junctions[id]?.phase ?? "ahead"
    const route = altRoute(ctx.source, id)
    if (!route) return null
    switch (event.type) {
      case "JUNCTION_POLL":
        return event.open ? { type: "POLL_OPENED" } : { type: "POLL_CANCELLED" }
      case "JUNCTION_DECIDE":
        return event.decision === "take" ? { type: "TAKE" } : { type: "STAY" }
      case "DIVERT":
        // A locked layer hides the fork; a fork behind the van is gone.
        return forkAhead(ctx, id) ? { type: "DIVERT" } : null
      case "JUNCTION_REACH": {
        const fork = forkAhead(ctx, id)
        if (!fork || state.status !== "driving") return null
        if (fork.odometer > ctx.mile + ARRIVAL_MILE_EPSILON) return null
        if (!event.towed && (isTowing(state) || eventAtFork(state, ctx, fork.odometer))) return null
        if (phase === "take" || phase === "stay") return { type: "REACH" }
        if (route.entry.kind === "outcome" || event.afterDecision || event.towed) {
          return { type: "PASS" }
        }
        // Reached undecided: the vote closes (tally or default), then the van reaches it.
        return {
          then: [
            { type: "VOTE_CLOSED", target: { kind: "junction", id } },
            { type: "JUNCTION_REACH", routeId: id, afterDecision: true },
          ],
        }
      }
      case "JUNCTION_TOW_SETTLE":
        if (phase === "polling") {
          return { then: [{ type: "VOTE_CLOSED", target: { kind: "junction", id } }] }
        }
        return phase === "ahead" ? { type: "PASS" } : null
      default:
        return null
    }
  },
  onEnter: {
    polling: (acc, { id, ctx }) => {
      const name = altRoute(ctx.source, id)?.name ?? id
      return { ...acc, log: [...acc.log, { kind: "junction", routeId: id, name, phase: "poll" }] }
    },
    take: (acc, { id, ctx, prior, event, emit }) => {
      const route = altRoute(ctx.source, id)!
      let next = acc
      if (event.type === "JUNCTION_DECIDE") {
        next = patchJunction(next, id, {
          defaulted: event.defaulted,
          ...(event.votes ? { votes: event.votes } : {}),
        })
        next = {
          ...next,
          log: [
            ...next.log,
            {
              kind: "junction",
              routeId: id,
              name: route.name,
              phase: "take",
              ...(event.votes ? { votes: event.votes } : {}),
              defaulted: event.defaulted,
            },
          ],
          effects: event.votes
            ? [...next.effects, resultSign(route.name, route.icon ?? "🛣️", "take", event.votes)]
            : next.effects,
        }
      } else if (event.type === "DIVERT") {
        // A divert closes an open vote without a decision; the outcome decided it.
        next = emit(next, { type: "VOTE_CANCEL", target: { kind: "junction", id } })
        next = {
          ...next,
          log: [...next.log, { kind: "junction", routeId: id, name: route.name, phase: "take" }],
          effects: [
            ...next.effects,
            {
              type: "sign",
              variant: "warning",
              icon: route.icon ?? "🛣️",
              title: `Detour: ${route.name}`,
              body: "The van will turn off up ahead.",
            },
          ],
        }
      }
      // Already at the fork (an event there stopped the van): turn now.
      const fork = forkAhead(prior, id)
      if (fork && fork.odometer <= prior.mile + ARRIVAL_MILE_EPSILON) {
        return emit(next, { type: "JUNCTION_REACH", routeId: id })
      }
      return next
    },
    stay: (acc, { id, ctx, event }) => {
      if (event.type !== "JUNCTION_DECIDE") return acc
      const route = altRoute(ctx.source, id)!
      const next = patchJunction(acc, id, {
        defaulted: event.defaulted,
        ...(event.votes ? { votes: event.votes } : {}),
      })
      return {
        ...next,
        log: [
          ...next.log,
          {
            kind: "junction",
            routeId: id,
            name: route.name,
            phase: "stay",
            ...(event.votes ? { votes: event.votes } : {}),
            defaulted: event.defaulted,
          },
        ],
        effects: event.votes
          ? [...next.effects, resultSign(route.name, route.icon ?? "🛣️", "stay", event.votes)]
          : next.effects,
      }
    },
    taken: (acc, { id, ctx, prior }) => {
      const route = altRoute(ctx.source, id)!
      const fork = forkAhead(prior, id)
      if (!fork) return acc
      const turned = appendLeg(acc, { route: id, fromMile: 0, odometerStart: fork.odometer })
      return {
        ...turned,
        log: [...turned.log, { kind: "junction", routeId: id, name: route.name, phase: "taken" }],
        effects: [
          ...turned.effects,
          {
            type: "sign",
            variant: "info",
            icon: route.icon ?? "🛣️",
            title: `Turning onto ${route.name}`,
            body:
              route.end.kind === "destination"
                ? "This road ends somewhere new."
                : `It rejoins ${routeName(ctx.source, route.end.route ?? route.from.route ?? "main")} later.`,
          },
        ],
      }
    },
    passed: (acc, { id, ctx, emit }) => {
      const name = altRoute(ctx.source, id)?.name ?? id
      const cancelled = emit(acc, { type: "VOTE_CANCEL", target: { kind: "junction", id } })
      return {
        ...cancelled,
        log: [...cancelled.log, { kind: "junction", routeId: id, name, phase: "passed" }],
      }
    },
  },
}
