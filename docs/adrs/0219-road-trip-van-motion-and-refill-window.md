# 0219. Road-trip van motion actor and fuel refill window

**Date:** 2026-10-21
**Status:** Accepted

## Context

The road-trip strip and the Trip tab both draw the van on `TripRouteLine` ([0205](0205-road-trips-v1.md)). The van should animate when its phase changes: a wheelie when departing, a rubber-band stop when parking, a nudge when held. Phases are derived from the `TripStore` projection on every 1Hz tick, so each component would have to track the previous phase itself. Two mounted views would then disagree about which flourish is playing. The fuel gauge has a similar problem. The store only filled the tank once a refuel resolved, so pumping or waiting for delivered gas showed nothing until the gauge jumped to full.

## Decision

1. **One van-motion actor per room and trip.** `roadTripVanMotionMachine` is a parallel machine. Its `phase` region follows `SYNC { phase }` events, which carry the phase from `vanPhase(trip, mile)`. Its `flourish` region plays `depart`, `park` or `hold` for a fixed time (`VAN_FLOURISH_MS`), then clears it. The first sync snaps to the phase without a flourish. No flourish starts while animations are disabled.
2. **Shared like plugin component actors.** `roadTripVanMotionRegistry` keeps one actor per `${pluginName}:${tripKey}`, the same way [0093](0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md) keeps plugin component actors. `teardownPluginComponentActors()` also tears down the van-motion actors. `useRoadTripVanMotion` returns `{ phase, flourish, flourishId }`. `TripRouteLine` remounts the van on `flourishId` to replay the keyframes.
3. **The store carries a refill window.** `TripStore.fuel.refill = { fromGallons, startedAt, endsAt }` is projected while the tank is being filled. That covers an automatic gas fund (from its opening to its end), the out-of-gas delivery wait, and 20 seconds (`INSTANT_REFILL_SHOW_MS`) after an instant or early fill. The client draws the gauge at `refillGallonsAt` (from `@repo/road-trip-map`) on the shared ticker. After a fill, the gauge shows the smaller of the climbing level and the interpolated fuel, so it never shows more than the van has.

## Consequences

- The strip and the Trip tab play each flourish together, once.
- Other road-trip views can use `useRoadTripVanMotion` without adding state.
- The 20s fill after an instant refuel is just for show. The tank is already full on the server.
