import {
  linearize,
  START_LEG,
  type JunctionDecision,
  type LinearPath,
  type TripMap,
  type TripView,
} from "@repo/road-trip-map"
import type { TransitionContext } from "../helpers"
import type { TripState } from "../state"

/**
 * The only builder of `TripView` (ADR 0222): where the van has driven, which
 * layers are live, which forks are decided, and which layer content is kept
 * as a commitment (a decided, signed stop; a running event).
 */
export function flowView(state: TripState, map: TripMap): TripView {
  const layersActive = new Set<string>()
  for (const [id, layer] of Object.entries(state.layers ?? {})) {
    if (layer.phase === "unlocked") layersActive.add(id)
  }
  const junctionDecisions: Record<string, JunctionDecision> = {}
  const junctionsDone = new Set<string>()
  for (const [id, junction] of Object.entries(state.junctions ?? {})) {
    if (junction.phase === "take" || junction.phase === "stay")
      junctionDecisions[id] = junction.phase
    if (junction.phase === "taken" || junction.phase === "passed") junctionsDone.add(id)
  }
  const keep = new Set<string>()
  if (map.layers?.length) {
    for (const site of map.sites) {
      if (!site.layer || layersActive.has(site.layer)) continue
      const runtime = state.sites[site.id]
      if (!runtime) continue
      if (runtime.phase === "parked" || runtime.phase === "visited") keep.add(site.id)
      else if (runtime.phase === "stopping" && runtime.revealed) keep.add(site.id)
    }
    for (const run of state.beatRuns) keep.add(run.eventId)
    if (state.incident) keep.add(state.incident.incident)
  }
  return {
    legs: state.path?.length ? state.path : [START_LEG],
    layersActive,
    junctionDecisions,
    junctionsDone,
    keep,
  }
}

/** `map` laid flat along the van's path for `state`. */
export function pathFor(state: TripState, map: TripMap): LinearPath {
  return linearize(map, flowView(state, map))
}

/** `ctx` with its path re-laid for `state` (after a layer, fork, or leg changed). */
export function refresh(ctx: TransitionContext, state: TripState): TransitionContext {
  const path = pathFor(state, ctx.source)
  if (path === ctx.path) return ctx
  return { ...ctx, map: path.map, path }
}
