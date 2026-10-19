# 0213. Game Studio trip simulator steps the pure trip runtime

**Date:** 2026-10-19
**Status:** Accepted

## Context

A road trip ([0205](0205-road-trips-v1.md)) runs in real time on durable schedules. A trip map designer wants to walk a map one timeline event at a time (reveals, exit polls, stops, gas funds, incidents) and see each event in the real Room UI, without waiting for the clock and without running the API, Redis, or the scheduler.

studio-bridge already previews road-trip UI from canned fixtures (`STUDIO_BRIDGE_TRIP_PREVIEW`). Fixtures show the components, but not what a particular map does. The plugin's tests already drive the pure runtime through `TripSim` (`plugin-road-trip/trip/testSim.ts`): the same transitions, commit, thresholds, and log as `mutateTrip`, with schedules fired in time order.

## Decision

1. **Game Studio runs `TripSim`.** A **Trip sim** page (`#/trip-sim`) loads the trip-map draft or a saved map, departs, and steps with `TripSim.stepNext()`, which fires exactly one pending threshold or poll close, the earliest first (the order `runUntil` uses). The plugin, Redis, and durable schedules do not run. [0205](0205-road-trips-v1.md) remains the production path.
2. **A browser-safe entry.** `@repo/plugin-road-trip/sim` exports `TripSim`, the transitions the page calls, the store projection, and the poll and pool presenters. It must not import the plugin's `index.ts` (which pulls in plugin-base server helpers). `skipPollPresentation` and `poolCardView` live in a pure module that `index.ts` re-exports, so the preview shows production copy.
3. **Game Studio owns every decision.** Exit votes, voluntary pledges, and incident items are set on the sim page before stepping. studio-bridge only relays. Votes, pledges, and item uses made in the Room UI do not write back to the sim.
4. **A frozen store for the room.** The posted `TripStore` is anchored at wall-clock now with `van.mph` and fuel burn at 0, because clients interpolate from their own clock and a sim-time anchor would move the van. Poll `closesAt` and fund `endsAt` are posted far ahead; the designer closes them by stepping.
5. **studio-bridge keeps the sim beside the sandbox snapshot.** `POST /trip-sim` stores `{ store, messages, poll }` separately from `POST /sync`, so a sandbox sync can't drop trip chat. LOGIN, plugin component hydration, and live emits (`PLUGIN:road-trip:TRIP_UPDATED`, `MESSAGE_RECEIVED`, `POLL_PUBLISHED`, `POLL_CLOSED`) prefer it over the fixture, with no env flag. The fixture stays for a room with no sim loaded.

## Consequences

- A designer can see exactly what a map produces, event by event, in the real Room UI.
- The sim shares the pure runtime with production, so it reflects transition changes immediately. Effects that need other plugins (Item Shops rounds, nudges, automatic levies against real wallets) are approximated: shops appear only as site state, and levies split `TripSim`'s sample wallets.
- The van does not glide between steps in the preview. That is the trade for not running a clock.
- Room-side interaction with the trip is read-only while the sim is loaded.

## See also

- [0205. Road trips v1](0205-road-trips-v1.md)
- [0207. Trip Maps as portable JSON](0207-trip-maps-portable-json.md)
- [0209. Trip funds](0209-trip-funds-escrow-pool-and-levy.md)
