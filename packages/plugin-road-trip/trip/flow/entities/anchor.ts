import { altRoute, MAIN_ROUTE_ID, type PathLeg, type TripMap } from "@repo/road-trip-map"
import { ARRIVAL_MILE_EPSILON } from "../../helpers"
import { isTowing, type TripState } from "../../state"
import type { FlowAcc, FlowHandler } from "../dispatch"

/**
 * Where the van is on the map's routes (ADR 0222): `state.path` lists the legs
 * driven, the last being the one the van is on. A leg is appended only when
 * the van turns at a fork (junction entity) or reaches a rejoin (here).
 */

export function routeName(map: TripMap, routeId: string): string {
  return routeId === MAIN_ROUTE_ID ? "the main road" : (altRoute(map, routeId)?.name ?? routeId)
}

export function currentLeg(state: TripState): PathLeg | undefined {
  return state.path[state.path.length - 1]
}

/** The van turns onto `leg`. */
export function appendLeg(acc: FlowAcc, leg: PathLeg): FlowAcc {
  return { ...acc, next: { ...acc.next, path: [...acc.next.path, leg] } }
}

/**
 * ROUTE_END: the van reached the end of the alternate route it's on, which
 * rejoins another. It continues on the target, and the parent stretch the
 * route skipped is bypassed.
 */
export const routeEndHandler: FlowHandler = (acc, event, ctx, emit) => {
  if (event.type !== "ROUTE_END") return acc
  const state = acc.next
  if (state.status !== "driving") return acc
  if (!event.towed && isTowing(state)) return acc
  if (currentLeg(state)?.route !== event.routeId) return acc
  const end = ctx.path.ends.find((e) => e.routeId === event.routeId)
  if (!end || end.odometer > ctx.mile + ARRIVAL_MILE_EPSILON) return acc
  const route = altRoute(ctx.source, event.routeId)
  const name = route?.name ?? event.routeId
  let next = appendLeg(acc, end.next)
  next = {
    ...next,
    log: [...next.log, { kind: "junction", routeId: event.routeId, name, phase: "rejoined" }],
    effects: [
      ...next.effects,
      {
        type: "sign",
        variant: "info",
        icon: route?.icon ?? "🛣️",
        title: `Back on ${routeName(ctx.source, end.next.route)}`,
        body: `${name} rejoins here.`,
      },
    ],
  }
  return emit(
    next,
    ...end.bypasses.map((siteId) => ({
      type: "SITE_BYPASS" as const,
      siteId,
      reason: "route" as const,
    })),
  )
}
