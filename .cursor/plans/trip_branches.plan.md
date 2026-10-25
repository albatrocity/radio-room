# Trip branches: layers, routes, choices, passengers

## Context

A trip map is one line today. `route` is a scalar (`driveMinutes`, `baseMph`), and every site and event has one `mile` between 0 and `routeMiles`. Throughout the engine, "ahead" means a plain mile comparison against the ledger's odometer: `sortedSites`, `nearestMechanicAhead`, `milesToNextGas`, `parkPlan`, `skipDefaultsAhead`, thresholds, and the projection. Authors want the trip to branch.

The three scenarios break down into four separate concepts. Each one can ship on its own.

| Concept | What it is | Scenario |
|---|---|---|
| **Layer** (parallel) | A named group of sites and events on an existing route. They are inert until the layer is unlocked. Geometry does not change; the van just "knows more". | Welcome Center, Map item, Hitchhiker's tips |
| **Route** (exclusive) | Alternate geometry that forks off a parent route at a mile. It either rejoins a route at a mile (rejoining at the fork mile means "return") or ends at its own destination. The van is on exactly one route at a time. | Shortcut |
| **Outcome** | A small closed list of state changes: `unlock`, `lock`, `divert`, `board`, `drop`. Sites (`onVisit`), events (`outcomes` at start), items, and choice options all apply them. | Glue for all three |
| **Choice** | A vote whose options apply outcomes. A route fork gets a junction poll before the fork. An event gets a `choice` resolution step. | Shortcut vote, "Pick them up?" |
| **Passenger** (later phase, may be deferred) | An ephemeral persona user. It unlocks layers while aboard and posts authored lines. | Hitchhiker |

This keeps "parallel route" from becoming geometry: it is gating on the same road. Only exclusive routes need the path refactor.

Assumes `.cursor/plans/trip_events` has landed, which provides `map.events`, `compileEventSteps`, beats, the snapshot, and ADR 0220. The new decisions go in **ADR 0221** (trip branches). Passengers get ADR 0222 when that phase starts. `schemaVersion` stays 1, because every field is optional.

## Schema (`packages/road-trip-map/src/schema.ts`)

```ts
// Outcomes — closed list, applied in order
tripOutcomeSchema = discriminatedUnion("kind", [
  { kind: "unlock", layer }, { kind: "lock", layer },
  { kind: "divert", route },            // decide a fork ahead as "take"
  { kind: "board", passenger }, { kind: "drop", passenger },   // phase 4
])

map.layers?: max 8 [{ id, name, icon, unlockedNarrative?, lockedNarrative?,
                      unlockItems?: string[] /* item short ids that unlock it on use */ }]

map.routes?: max 8 [{ id, name, icon?, driveMinutes,           // own length, authored in minutes (ADR 0207 d3)
  from: { route?: id /* default "main" */, mile },
  end: { kind: "rejoin", route?: id, mile } | { kind: "destination" },
  layer?: id,                                                  // the fork exists only while the layer is active
  entry: { kind: "vote", question?, leadMinutes?, default: "take"|"stay", mystery? }
       | { kind: "outcome" } }]                                // only a divert outcome takes it

site += { route?: id, layer?: id, onVisit?: TripOutcome[] }    // the mile is local to its route
event += { route?: id, layer?: id, outcomes?: TripOutcome[] }  // outcomes are applied when it starts
eventResolution += { kind: "choice", question, seconds?, default: optionId,
                     options: 2–4 [{ id, label, outcomes, narrative? }] }
```

`"main"` is the reserved id of `map.route`. A rejoin `mile` that equals the fork `mile` is the "return" ending. A rejoin past the fork bypasses the parent segment in between.

## Core abstraction: the path (`packages/road-trip-map/src/paths.ts`, new)

- `RouteAnchor = { route, routeMile, odometer }`. The van's position on its route is `routeMile + (ledgerMile − odometer)`. The ledger stays the odometer, so fuel and legs are unchanged.
- `TripView = { anchor, layersActive: Set, junctionDecisions: Record<routeId, "take"|"stay"> }`.
- `pathAhead(map, view)` returns ordered segments `{ route, fromMile, toMile, odometerStart }` from the anchor to the destination. Undecided forks use their default. A linear map gives a single segment, so all current behavior and tests fall out unchanged.
- `contentOnPath(map, view)` returns active sites and events on those segments, each with its odometer mile.

The following helpers become path-aware and keep their old signatures as single-segment wrappers:
- in `derive.ts`: `sortedSites`, `milesToNextGas`, `fuelPlan`, `parkPlan`, `skipDefaultsAhead`
- in `incidents.ts`: `nearestMechanicAhead`, `mileEvents`

`routeMiles` for a path is the odometer total to the path's destination.

## Runtime (`packages/plugin-road-trip`)

- **State** (`trip/state.ts`): add `anchor`, `layers: Record<id, {at, by}>`, `junctions: Record<routeId, JunctionRuntime>` (phases `ahead|polling|take|stay|taken|passed`, plus votes and defaulted), and a `bypassed` site phase. `normalizeTripState` defaults these for linear trips.
- **Thresholds** (`trip/thresholds.ts`): solve everything from `contentOnPath` odometer miles instead of `site.mile`. New kinds:
  - `junction-poll`: the lead before a fork, using the skip-poll timing from `resolveSiteSettings`.
  - `junction`: the fork mile is reached. Re-anchor if the decision is "take", otherwise mark it `passed`.
  - `route-end`: on a rejoin, re-anchor at the parent's rejoin mile and mark the skipped parent segment's sites `bypassed`. On a `destination` end, the normal destination arrival applies.
- **Outcomes** (`trip/transitions.ts`): add one `applyOutcomes(state, map, outcomes, ctx)` that returns `{ next, log, effects }`.
  - `unlock` and `lock` toggle layers and post the layer's sign.
  - `lock` closes open polls for that layer's content ahead. A stop already in progress is not interrupted.
  - `divert` sets a fork ahead to `take`. If the van is within `ARRIVAL_MILE_EPSILON` past the fork, it re-anchors immediately, which covers an event at the fork mile that stops the van.
  - It is called from the site's `onVisit` on park, from the event's start (including narrative-only events), from choice resolution, and from item use.
- **Polls**: factor the skip-poll open/defer/close/decide logic in `index.ts` (`handleSkipPoll`, `handlePollClosed`, `decide`) into a target-agnostic helper keyed by `{ kind: "site"|"junction"|"choice", id }` with N options.
  - The site skip poll and the junction poll keep their two options. The choice step uses 2–4.
  - The 409 retry and the fall back to the default are shared.
- **Choice step** (`trip/incidents.ts`, `compileEventSteps`):
  - A `choice` resolution compiles to a timed `choice` step. Entering the step emits `open-poll`.
  - `POLL_CLOSED`, the step expiring, or a host skip resolves it with the tally or the default. It then applies the winning option's outcomes and narrative and advances the step.
  - With `effect: stop` the van pulls over while the room votes. With no effect it keeps driving, which follows ADR 0220's rule for narrative-only events, except that a choice holds the incident slot.
- **Tow** walks `pathAhead`. On arrival it re-anchors to the Mechanic's route. Forks passed on the hook are marked `passed` or `taken` according to the path's decision.
- **Items** (`items/index.ts`, `van.ts`): `routeItemUse` gains an `unlock` route. A new consumable "Local Map" is consumed only if it unlocks a locked layer whose `unlockItems` lists it, matching how consumables work now. Buying an item still does nothing to the trip.
- **Projection** (`trip/projection.ts`, `storeTypes.ts`): the client stays linear and spoiler-safe.
  - `sites[].mile` and `routeMiles` are odometer miles along the current path.
  - Inactive layer content and alternate routes are never sent. Bypassed sites are dropped.
  - Add optional `junction` markers only once their poll opens. Add `route: { id, name }` while the van is off main.
  - `tripView.ts` needs little change.

## Game Studio (`apps/game-studio`)

- `TripRouteTrack` becomes a stack of rows on one shared mile scale:
  - The main row spans the full width.
  - Each alternate route's row starts at x(fork mile) and runs its own length. An elbow connector goes up to the fork and down to the rejoin mark on its target row (or a flag for a destination end). Shortcuts look shorter and detours look longer.
  - Layer content renders as a thin labeled sub-row (layer icon and name) under its route's row, with a toggle to show or hide it.
  - Pins drag within their own row, and the fork and rejoin handles drag too.
- New `TripRouteInspector` and `TripLayerInspector`, modeled on `TripSiteInspector`. The site and event inspectors gain `route` and `layer` selects plus an outcomes editor. The event inspector gains the `choice` resolution editor.
- `tripMapDraft.ts` gets `addRoute`, `moveRouteFork`, `moveRouteEnd`, `addLayer`, and `moveSite`/`moveEvent` scoped to a route.
- Simulator (ADR 0213): `TripSim` and `simRoom` support junction and choice votes (generalize `setVotes`) and toggling layers. `describeTripSim` labels re-anchors and unlocks.
- `apps/studio-bridge/src/stubRoadTrip.ts` gets the new store fields.

## Lint (`packages/road-trip-map/src/lint.ts`)

- Errors:
  - an unknown `route`, `layer`, or `passenger` reference
  - a fork or rejoin mile beyond its parent's length
  - a rejoin before the fork
  - a cycle in the route graph
  - a `destination` end with no destination site on that route, or more than one
  - a `rejoin` route that carries a destination
  - a `divert` with no fork ahead of its source
  - a `choice` whose default is not one of its options
  - site spacing below 0.1 mi on the same route, with layers included
- Warnings:
  - a mandatory site on a parent segment that some route can bypass
  - a layer that nothing unlocks
  - a route with `entry: outcome` that nothing diverts to
- Fuel-gap and deadline checks run over each enumerated path, capped at 32 combinations. Above the cap the lint warns and checks only the default path.

## Phases

1. **Layers and outcomes.** ADR 0221. Schema for `layers`, site and event `layer`, `onVisit`, event `outcomes` (`unlock`/`lock` only). Layer runtime, gating in thresholds and the projection, Local Map item, lint, and Studio layer sub-rows and inspector. Sample map: a Welcome Center that unlocks a "Local tips" layer with one site and one event.
   - *Done:* a linear map's tests are unchanged. Visiting the Welcome Center unlocks the layer, and its site is then revealed, polled, and visited. The layer's event fires only when unlocked. The Map item is consumed only when it unlocks something. Locking mid-trip closes an open poll for that layer's content.
2. **Routes and junction votes.** `paths.ts`, plus the path-aware helpers and the `anchor`. Junction poll and fork, route end (rejoin, return, destination), the `bypassed` phase, tow across junctions, the `divert` outcome, the poll helper refactor, projection on path miles, Studio route rows, the sim, and lint.
   - *Done:* a parity test shows that every derive helper gives identical results on the existing sample map. A shortcut vote "take" re-anchors at the fork, bypasses parent sites, and rejoins. "Stay" passes. Return and destination ends work. A tow carries the van across a rejoin. ETA and fuel follow the decided path. The client never sees an untaken route.
3. **Event choices.** The `choice` resolution and step, the N-option poll, outcomes on resolve, and Studio choice editor and sim voting.
   - *Done:* a choice with `stop` holds the van until the poll closes, and the default applies on a tie, a timeout, or a host skip. A "Road closed" choice that diverts takes a fork ahead. A 409 conflict retries and then falls back to the default.
4. **Passengers (may be deferred).** ADR 0222, `map.passengers[]` (`name`, `icon`, `unlocks: layer[]`, `lines: { board, drop, chatter? }`, `dropAt?: siteId`), and the `board` and `drop` outcomes.
   - Runtime: `spawnEphemeralUser`, `personas.assign("hitchhiker")`, `sendChatMessageAsUser`, and `state.passengers`, following `SonRegistry`'s persistence and reconcile pattern (`packages/plugin-item-shops/helpers/sonRegistry.ts`). Despawn on drop, trip end, new trip, unload, or session end.
   - Layer activity becomes "unlocked, or unlocked by a passenger aboard".
   - *Done:* the Hitchhiker choice boards the persona user, which shows up in the user list, its layer's events become available, and dropping it off locks them again and despawns it.

## Reuse

- Skip-poll machinery in `packages/plugin-road-trip/index.ts` (`handleSkipPoll`, `handlePollClosed`, `deferPoll`), `transitions.ts` (`decide`, `liveSkipDefault`, `pollResultSign`, `resolveSkip`).
- `resolveSiteSettings` and `revealMileAtBaseSpeed` for junction lead and reveal timing.
- The `routeItemUse` → `mutateTrip` item path (`items/index.ts`, `index.ts` `onItemUsed`).
- The `compileEventSteps` step engine and the `incident:<id>:<step>` thresholds from trip_events.
- Ephemeral user and persona APIs (ADR 0194), and `SonRegistry` as the pattern for persistence and reconcile.

## Verification

- `npm test` (vitest) in `packages/road-trip-map`, `packages/plugin-road-trip`, `apps/game-studio`, and `apps/web` (tripView). The existing trip, index, and simRoom suites stay green after every phase.
- New tests:
  - `paths.test.ts`: the parity test plus branch math.
  - `trip.test.ts`: unlock, gating, fork take and stay, rejoin, return, destination end, and tow across a junction.
  - `simRoom.test.ts`: junction and choice votes.
  - `lint` cases for every new error and warning.
- Game Studio:
  - Stamp a shortcut route and a layer, drag the fork and rejoin handles, then check that Copy JSON round-trips through `parseTripMap`.
  - Run the simulator through a "take" vote and a "stay" vote and check that the room strip shows only the taken path.
