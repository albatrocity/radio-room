# 0231. Trip flow and branches: one statechart of small machines; layers, routes, outcomes, choices

**Date:** 2026-10-25
**Status:** Partially superseded by [0236](0236-trip-defined-maps.md) (decisions 9 `unlockItems` and 14 Local Map)

## Context

A trip map was one line: a scalar `route`, and every site and event at one `mile`. Throughout the engine, "ahead" was a plain mile comparison against the ledger's odometer. Site phases were written with `withSite(…, { phase })` from both `transitions.ts` and `trip/incidents.ts`, and the trip `status` was written in four places. Authors wanted trips to branch: stops that appear only after a Welcome Center or a Local Map, shortcuts the room votes on, and events that ask the room a question. Adding branching to that layout would have spread state changes further.

## Decision

### The trip flow

1. **A trip is one statechart built from small flat machines** (`plugin-road-trip/trip/flow/`). The trip lifecycle runs beside one machine per site, junction (fork), layer, and vote. One event vocabulary (`TripFlowEvent`, `flow/events.ts`) covers everything that can happen to them. One `dispatch(...events)` (`flow/dispatch.ts`) routes each event to its entity, which runs three steps: `interpret` (the only place with conditions) → `send` on its table (legal moves only) → `onEnter` (the only place with effects). Follow-up events run depth-first through `emit`, capped at 64 per dispatch; going over the cap throws, which aborts the CAS write. `dispatch` returns an ordinary `Transition`, so ADR 0213's CAS, leg commit, and effects are unchanged.
2. **No XState.** Nothing ticks in this model and no process lives per trip (ADR 0213), so XState's actors and timers would go unused. Phases stay plain strings in Redis, and `normalizeTripState` lifts them across deploys. The engine (`flow/machine.ts`, about 60 lines) has no imports and is meant to move to `@repo/utils` once a second plugin needs it. **Bounds:** machines are flat (no nesting, history, or parallel states inside one machine), tables list legal moves only (no guards or actions), and there are no timers (time comes from thresholds). If we ever need nesting or history, that's the signal to adopt XState rather than grow the engine.
3. **Ownership rules**, enforced by `trip/flow/architecture.test.ts`:
   1. Only flow entities change a phase or the trip status. `withSite` no longer accepts `phase` or `vote`, so the compiler catches site writes. Source scans catch the rest.
   2. Only `flow/outcomes.ts` interprets outcomes.
   3. Only `road-trip-map/src/paths.ts` reads authored miles. Runtime code reads the path map (`ctx.map`, `pathFor(...)`) and never `ctx.source.sites` or `ctx.source.events` outside `flow/`.
4. **One vote lifecycle.** A `VoteRuntime` (`pending → open → decided`) lives on each site, each junction, and the active incident's choice step. Everything that differs per target sits in a `VoteSpec`: copy, timing, options, the default, and what the owner does with the winner. The plugin keeps three generic I/O paths. `openVote(target)` replaces `handleSkipPoll`. `handlePollClosed` finds the vote by `pollId`. `mutateTrip` reads the tallies of open polls before the CAS (`ctx.tallies`), which replaces the special tally read in `handleArrive`. The `skip-poll` threshold kind is renamed `vote-due`; schedules armed under the old name still run.
5. **Generated docs.** `npm run flow:docs` writes `docs/road-trip-flow.md` from the tables and `FLOW_EVENT_DOCS`. A test fails when the file is stale.

### Geometry

6. **The map laid flat along the van's path.** `linearize(map, view)` (`paths.ts`) returns a `PathMap`: the active sites and events on the path's segments, each at its odometer mile, with the route's drive minutes and tanks per trip scaled to the path's length (so the base burn per mile is unchanged). Every existing derive helper (`sortedSites`, `fuelPlan`, `parkPlan`, `skipDefaultsAhead`, `nearestMechanicAhead`, `mileEvents`) works on it unchanged. A linear map comes back as itself. `TransitionContext` carries `map: PathMap`, `path` (forks and rejoins ahead), and `source` (the authored map). `applyTransition` recomputes `state.routeMiles` from the path after every transition.
7. **`TripView`** (built only by `flowView`) is: the legs driven (`state.path`), the active layers, the decided forks, the forks already done, and `keep`. `keep` holds the layer content that's a commitment while its layer is locked: a revealed stop the room chose, a parked or visited stop, a running event.
8. **An undecided fork counts as "stay"** everywhere: content, thresholds, ETA, fuel, and the projection. Its `default` applies only when its vote resolves. A route's stops never reach clients before the room has decided to take it.

### Branches

9. **Schema** (`schemaVersion` stays 1; every field is optional):
   - `map.layers[]`: `id`, `name`, `icon`, sign copy, `unlockItems` (replaced by `maps`, [0236](0236-trip-defined-maps.md)).
   - `map.routes[]`: `id`, `name`, `driveMinutes`, `from {route, mile}`, `end` (`rejoin {route, mile}` or `destination`), an optional `layer` gate, and `entry` (`vote` with a default, question, lead, and mystery flag; or `outcome`).
   - `route`, `layer` on sites and events (miles are local to their route), `onVisit` on sites, `outcomes` on events.
   - A `choice` resolution with 2–4 options, each with its own outcomes and narrative.
   - Outcomes are a closed list: `unlock`, `lock`, `divert`.
10. **Layers.** An unlock marks the layer's content behind the van as missed: sites go to `bypassed` and events go into `scriptedFired`, so nothing fires late. A lock cancels open votes on the layer's content and on forks it gates, and makes what's still ahead inert. Commitments carry on. A route's `layer` gates only its fork; a route already taken stays drivable.
11. **Routes.** At the fork the van takes the decided route (a new `PathLeg`). At a rejoin it continues on the target route, and parent stops in between become `bypassed`. A rejoin at the fork's own mile is a "return". A route can also end at its own destination.
12. **Tows.** Before a tow picks its Mechanic, each fork ahead is settled until a Mechanic lies before the next fork. An open vote resolves from its tally, an unpolled fork is passed, and a decided fork is honored. At the tow's arrival, the forks and rejoins it passed are applied in order.
13. **Choices** (amends [0228](0228-trip-events.md)):
    - On a `stop` event, a choice is its own held step.
    - A `slow` step hosts the event's choice. The van crawls until both the slowdown and the vote are over. An item that ends the slowdown early ends the event once the vote closes.
    - An event with no effect but a choice compiles to that choice alone. The van keeps driving, and the choice holds the incident slot.
    - The winner's outcomes and narrative apply, then the step advances. A host skip closes the vote with the tally so far.
14. **Items.** (Local Map superseded by trip-defined maps, [0236](0236-trip-defined-maps.md).) Local Map unlocks the next locked layer, in authored order, that lists it. Trip Guide reveals every non-secret, unrevealed site ahead on the path. Each is spent only if it changes something.
15. **Client store.** Clients still see one line: odometer miles along the path. Locked layers and untaken routes are never sent, and bypassed stops are dropped. `junctions[]` markers appear once a fork's vote opens, and `route` names the alternate the van is on.
16. **Authors.** `describeTripFlow(map)` (`flowOutline.ts`) lists the forks, layers, outcome sources, and every path with its miles, time, and fuel. Lint and Game Studio's Flow panel both read it. Lint covers references, fork and rejoin bounds, cycles, route destinations, diverts behind their source, choice defaults, and spacing per route; it warns on layers nothing unlocks, routes nothing takes, and bypassable mandatory stops. Fuel and deadline checks run on every enumerated path, capped at 32 combinations.

## Consequences

- Branching logic sits in one folder, and each part has one owner. A new kind of state change means adding a vocabulary entry and an entity, not a new path through `transitions.ts`.
- Existing behavior is unchanged: the pre-existing suites pass, with only renamed schedule ids and new items in their fixtures.
- Runtime code can't tell a fork from a straight road; it sees a linear `PathMap`. The cost is a `linearize` per transition, which is memoized per map and view.
- A winning "take" changes `routeMiles`, the ETA, and fuel range all at once on the client.
- The source-scan ownership tests are regex-based and can be dodged by renaming. The `withSite` type narrowing is the strong guarantee.
- The engine is homegrown. The bounds in decision 2 are what keep it from growing into a library.
- Passengers (the Hitchhiker) are left to their own ADR. They will add `board` and `drop` to the outcome union.

## See also

- [docs/road-trip-flow.md](../road-trip-flow.md) (generated)
- [0213. Road trips v1](0213-road-trips-v1.md) (decision 5: transitions now include `dispatch`)
- [0221. Game Studio trip simulator](0221-game-studio-trip-simulator.md)
- [0228. Trip events](0228-trip-events.md) (choice steps; the no-effect exception)
- [0232. Site departure outcomes](0232-site-departure-outcomes.md) (`onDepart`, applied on `SITE_LEAVE` while driving)
