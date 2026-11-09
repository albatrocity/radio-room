import { conditionHolds, type ConditionFacts, type TripOutcome } from "@repo/road-trip-map"
import { conditionFacts } from "../state"
import type { FlowHandler } from "./dispatch"
import type { OutcomeSource, TripFlowEvent } from "./events"

/**
 * The single interpreter of `TripOutcome`s (ADR 0222). Every source (a site
 * visit, a site departure, an event start, a choice option, an item) hands
 * its outcomes here as APPLY_OUTCOMES; no other module switches on `outcome.kind`.
 *
 * Each outcome's `when` (ADR 0230) is checked against `facts`: the trip as the
 * list started (snapshot), so a `give-key` never satisfies a `when` later in
 * the same list. Lint warns about that (`condition-reads-same-list-grant`).
 */
export function outcomeEvents(
  outcomes: readonly TripOutcome[],
  source: OutcomeSource,
  facts: ConditionFacts,
): TripFlowEvent[] {
  return outcomes.flatMap((outcome): TripFlowEvent[] => {
    if (!conditionHolds(outcome.when, facts)) return []
    switch (outcome.kind) {
      case "unlock":
        return [{ type: "LAYER_UNLOCK", layerId: outcome.layer, by: source }]
      case "lock":
        return [{ type: "LAYER_LOCK", layerId: outcome.layer, by: source }]
      case "divert":
        return [{ type: "DIVERT", routeId: outcome.route, by: source }]
      case "give-key":
        return [
          {
            type: "KEY_GIVE",
            key: outcome.key,
            by: source,
            ...(outcome.narrative ? { narrative: outcome.narrative } : {}),
          },
        ]
      case "take-key":
        return [{ type: "KEY_TAKE", key: outcome.key, by: source }]
      case "give-item":
        return [
          {
            type: "ITEMS_GIVE",
            item: outcome.item,
            to: outcome.to,
            qty: outcome.qty,
            by: source,
          },
        ]
    }
  })
}

export const applyOutcomesHandler: FlowHandler = (acc, event, _ctx, emit) =>
  event.type === "APPLY_OUTCOMES"
    ? emit(acc, ...outcomeEvents(event.outcomes, event.source, conditionFacts(acc.next)))
    : acc
