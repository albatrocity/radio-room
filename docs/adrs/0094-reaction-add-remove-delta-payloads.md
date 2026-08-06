# 0094. Reaction Add/Remove Emit Delta Only

**Date:** 2026-08-04
**Status:** Accepted

## Context

Busy rooms generate frequent `REACTION_ADDED` / `REACTION_REMOVED` events. Emitting the full reactions store on every add/remove made Socket.IO payloads and client merges scale with total reaction count rather than the change. Clients already keep a local reactions map hydrated from `INIT`.

## Decision

- **`REACTION_ADDED` and `REACTION_REMOVED`** carry a **delta only**: `{ roomId, reaction }` where `reaction` is required (`ReactionPayload`).
- Do **not** include the full `reactions` store on add/remove events.
- The **full reactions snapshot** is delivered on **`INIT`** (and any other intentional full-state refresh paths), not on incremental reaction events.
- Clients patch their local store from the delta (`allReactionsMachine` and equivalents).

## Consequences

- Wire size and client work stay O(1) per reaction toggle.
- Late joiners / reconnects still get a complete map via `INIT`.
- Plugins and other consumers of `REACTION_*` must not expect a full `reactions` blob on those events.

## See also

- [0008](0008-system-events-and-broadcaster-pattern.md) — SystemEvents + broadcasters
- [0014](0014-emit-domain-events-from-operations-only.md) — emit from operations
- `packages/server/operations/reactions/addReaction.ts`
- `packages/server/operations/reactions/removeReaction.ts`
- `packages/types/SystemEventTypes.ts`
- `apps/web/src/machines/allReactionsMachine.ts`
