# 0217. Pulling off holds signs for sites just past the stop

**Date:** 2026-10-19
**Status:** Accepted

## Context

A road trip ([0205](0205-road-trips-v1.md)) reveals each upcoming site with a "Coming up" road sign, then opens its skip poll a few minutes before the exit. Both are solved from the van's position. When two sites are close together and the room votes to pull off at the first, the second site's sign and poll can still arrive on the approach or while the van is parked. Players have already chosen where they're going, so a sign for a later stop is confusing.

## Decision

1. **A pull-off holds the sites just past it.** While an optional site is `stopping` (the room voted, or the default chose, to pull off) or `parked`, every other site from its mile to `PULL_OFF_HOLD_MILES` (3 mi) past it is held. `pullOffHold()` in `trip/helpers.ts` decides this. Mandatory stops never hold, because nobody chose them. Sites before the stop are not held, because the van reaches them first.
2. **Held means no reveal and no skip poll.** `solveThresholds` doesn't arm `reveal:<site>` or `skip-poll:<site>` for a held site, so `armThresholds` cancels any that were already armed. Its `arrive:<site>` is still armed. As a guard against a stale schedule that fires anyway, `revealSite` and `markPolling` refuse a held site, and the plugin's skip-poll handler returns before it creates a poll.
3. **Release is re-solving.** When the van leaves the stop, the stop becomes `visited`. Thresholds are re-solved from the new leg, so a held site's sign and poll are armed at their normal points. If a point has already gone by while the site is still ahead, they fire right away. Nothing extra fires for a site the van has already passed: arrival handles it, and `revealEvents` posts no sign for a site behind the van.
4. **A poll that reveals also signs.** After a hold, a site's reveal and poll can come due at the same moment. `markPolling` now reveals through `revealEvents`, so its "Coming up" sign is posted whichever of the two fires first. Normally the reveal still fires one second before the poll.
5. **The simulator matches for free.** `TripSim` and the Game Studio trip simulator ([0213](0213-game-studio-trip-simulator.md)) step the same `solveThresholds` and transitions. studio-bridge's road-trip fixture is static and doesn't change.

## Consequences

- After a pull-off, signs and polls follow the stop instead of overlapping it.
- A held site close behind the stop gets a short poll window after departure. If the window is too short, the existing give-up rule applies the site's default.
- The 3-mile window is a constant, not a map tuning value. If designers need to change it, it can move to `tuning`.
- The Studio's reveal ticks (`revealMileAtBaseSpeed`) still show where a site reveals when nobody pulls off.

## See also

- [0205. Road trips v1](0205-road-trips-v1.md)
- [0213. Game Studio trip simulator](0213-game-studio-trip-simulator.md)
