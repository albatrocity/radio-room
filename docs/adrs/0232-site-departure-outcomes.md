# 0232. Site departure outcomes

**Date:** 2026-10-29
**Status:** Accepted

## Context

A site's `onVisit` outcomes apply when the van parks ([0231](0231-trip-flow-and-branches.md)). Parking already opens the shop, posts the narrative, starts the park timer, and runs those outcomes. Authors need a later moment — the van pulling back onto the road — to unlock a layer, without stacking that unlock onto everything else that happens at the curb.

## Decision

1. **`site.onDepart`** is an optional `TripOutcome[]`, the same closed list as `onVisit` (`unlock`, `lock`, `divert`). `schemaVersion` stays 1. Only `flow/outcomes.ts` interprets the outcomes, via `APPLY_OUTCOMES`, with source `{ kind: "site", id }`.
2. **They apply when the site enters `visited` from `parked` (`SITE_LEAVE`) and the trip is still `driving`.** That is the park timer ending, or a Mechanic's incident clearing. A tow-in still counts as a visit, and its departure counts too.
3. **Ending the trip while parked does not apply them.** `closeOpenWork` leaves parked sites through the same `SITE_LEAVE`, after the trip status has already left `driving`. Skipping that case keeps a host "end trip" from unlocking stops on a trip that is over.
4. **Arriving at the destination does not apply them.** The destination enters `visited` from `SITE_ARRIVE`, not from a leave.
5. **Authors.** `outcomeSources` includes `onDepart`, so lint, "nothing unlocks this layer," and the Flow panel see it. The panel names that source `"${site.name}, on departure"`. Game Studio's site editor has an "On departure" list under "On visit."

## Consequences

- A layer can stay hidden through the stop and appear as the van leaves. Content already behind the van is still missed, under the same rule as any other unlock.
- A skip, a bypass, or a tow past the site never departs, so `onDepart` does not run.
- `onVisit` and `onDepart` are independent. The same layer can be named in both; the second unlock is a no-op once the layer is already unlocked.

## See also

- [0231. Trip flow and branches](0231-trip-flow-and-branches.md)
- [0235. Site departure narrative](0235-site-departure-narrative.md) — prose posted on the same leave, before these outcomes
