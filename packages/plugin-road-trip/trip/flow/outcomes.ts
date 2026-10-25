import type { TripOutcome } from "@repo/road-trip-map"
import type { FlowHandler } from "./dispatch"
import type { OutcomeSource, TripFlowEvent } from "./events"

/**
 * The single interpreter of `TripOutcome`s (ADR 0222). Every source (a site
 * visit, an event start, a choice option, an item) hands its outcomes here as
 * APPLY_OUTCOMES; no other module switches on `outcome.kind`.
 */
export function outcomeEvents(
  outcomes: readonly TripOutcome[],
  source: OutcomeSource,
): TripFlowEvent[] {
  return outcomes.map((outcome): TripFlowEvent => {
    switch (outcome.kind) {
      case "unlock":
        return { type: "LAYER_UNLOCK", layerId: outcome.layer, by: source }
      case "lock":
        return { type: "LAYER_LOCK", layerId: outcome.layer, by: source }
      case "divert":
        return { type: "DIVERT", routeId: outcome.route, by: source }
    }
  })
}

export const applyOutcomesHandler: FlowHandler = (acc, event, _ctx, emit) =>
  event.type === "APPLY_OUTCOMES" ? emit(acc, ...outcomeEvents(event.outcomes, event.source)) : acc
