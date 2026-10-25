---
name: Performance review — road trip
overview: The last five commits stay within the no-per-second server model. The one real cost is the Trip and Van tabs still running the 1 Hz ticker while Game State is open on another tab.
todos:
  - id: p1
    content: "P1 — Unmount inactive Game State tabs"
    status: completed
  - id: p2
    content: "P2 — Stop rereading the trip log on every publish (deferred)"
    status: cancelled
isProject: false
---

# Performance review: road trip (last 5 commits)

**Date:** 2026-10-25
**Boundary:** `76030354`..`65fa0825` (code optim, trip events, trip summary, cruising speed, Open Shop), plus one hop on publish → client store → the 1 Hz ticker.
**Scale lens:** current ≈ 1 room/month, &lt;100 concurrent; growth possible
**Verdict:** Healthy at current load. Nothing on the server ticks per second. The hottest new client path is the Trip tab reconciling its log on the shared 1 Hz ticker while Game State is open.

## Inventory

| Layer | Hot path |
|-------|----------|
| Plugin publish | `RoadTripPlugin.buildPayload` still emits one `TRIP_UPDATED` per transition ([ADR 0205](docs/adrs/0205-road-trips-v1.md)). The trip-summary commit added `readLog()` on that path. |
| Schedules | Beats arm at most 8 thresholds per running event and drop when the incident clears ([ADR 0220](docs/adrs/0220-trip-events.md)). Not a 1 Hz loop. |
| Client ticker | `useNow` is one shared interval. The strip, Trip tab, and Van tab each call `useInterpolatedVanMile`. |
| Van motion | `useRoadTripVanMotion` sends `SYNC` only when the phase string changes. Flourishes are a short CSS animation, not a rAF loop. |
| Game State | `UserGameStateSurface` returns null when the surface is closed, so the tabs unmount. While it is open, `Tabs.Root` does not set `lazyMount` or `unmountOnExit`. |

Schema caps that bound the new payload: 64 sites, 32 events, 8 beats, narrative ≤ 2000 characters, trip log ≤ `MAX_LOG_ENTRIES` (3000).

## Findings

| ID | Sev | When | Title | Location | Failure mode |
|----|-----|------|-------|----------|--------------|
| F1 | P2 | Now | Hidden Trip and Van tabs still subscribe to the 1 Hz ticker | `UserGameStateSurface` `Tabs.Root`; `RoadTripTripPanel`; `RoadTripVanPanel` | Ark presence leaves tab content mounted when `lazyMount` and `unmountOnExit` are unset (`unmounted` stays false). Opening Game State on Inventory still runs `useNow` inside the Trip log (`tripLog`, narratives, `useStickToBottom`) and the Van panel. That is main-thread work on each listener's device, once a second, for as long as the surface is open. A real map is a handful of rows; the schema worst case is 64 sites plus their narratives. |
| F2 | P3 | Later | Every publish reads and parses the whole trip log | `buildPayload` → `TripStorage.readLog` (`LRANGE 0 -1`, `JSON.parse`, then `describeVanEvent`) | Added so `TripStore.events` can mirror the export wording. Publish is per transition (arrive, beat, incident step), not per second. A show's log stays far under 3000 lines. At the cap, one publish walks the full list on the API process and the van-event slice goes out on the room snapshot. |

## Fix plan (opt-out)

Neither item is default-keep. Both are safe to defer. P0–P1 Now/Near: none.

### P1 — Unmount inactive Game State tabs
- **Status:** completed. `Tabs.Root` sets `lazyMount` and `unmountOnExit`. The strip is outside this tree. A remount reads the room-scoped plugin store.
- **Addresses:** F1
- **When:** Now
- **Depends:** none
- **Files:** `apps/web/src/components/Modals/UserGameStateSurface.tsx` (`Tabs.Root`)
- **Change:** Set `lazyMount` and `unmountOnExit` so a plugin tab mounts on first selection and unmounts when the listener leaves it. The strip keeps its own 1 Hz subscription in `aboveChat`. Do not add a second ticker.
- **Done means:** With Game State open on Inventory, the Trip panel is not in the React tree (no `useNow` from `RoadTripTripPanel`). Selecting Trip mounts the log, pinned to the newest row. Leaving Trip unmounts it.
- **Risk:** Scroll position in the trip log is lost when switching away. Other plugin tabs in that `Tabs.Root` get the same mount policy.

### P2 — Stop rereading the trip log on every publish
- **Status:** deferred. Not opted in.
- **Addresses:** F2
- **When:** Later
- **Depends:** none
- **Files:** `packages/plugin-road-trip/index.ts` `buildPayload`, `packages/plugin-road-trip/trip/store.ts` `readLog`, `packages/plugin-road-trip/trip/projection.ts`
- **Change:** Keep the projected van-event rows with the trip (append when a part or incident line is logged) and pass that slice into `buildTripStore`, instead of `LRANGE` plus `describeVanEvent` over the full log on every settle. The room export can keep reading the log.
- **Done means:** A publish no longer calls `readLog()`. `TripStore.events` still matches `describeVanEvent` for the same log, covered by the existing projection test.
- **Risk:** The stored slice can drift from the log if a writer forgets to append. Worth it only if a long-running trip makes the full-list read show up.

## Measurement / validation notes
- For P1: open Game State on a non-trip tab during a driving fixture and confirm the Trip panel is unmounted. No server metric.
- For P2: none until a trip log is large enough that `readLog` shows up in an API profile. Do not add a benchmark for it now.

## Explicit non-actions

- The server still does not tick the van. Mile and fuel move on the client from the existing anchor (`interpolateVanMile`, `refillGallonsAt`). [ADR 0219](docs/adrs/0219-road-trip-van-motion-and-refill-window.md) did not add a socket per second.
- `roadTripVanMotionMachine` does not re-render on the ticker. `SYNC` is sent only when `vanPhase` changes. The registry is one actor per trip key, torn down with the plugin component actors.
- Beat thresholds are at most 8 per running event and are removed when the incident clears. They are not a schedule storm.
- Visited narratives and van-event lines ride the existing full `TRIP_UPDATED` snapshot. A normal map is kilobytes per transition, sent to the room, not per second. Replacing that snapshot with deltas would fight [ADR 0205](docs/adrs/0205-road-trips-v1.md) and is not justified at this size.
- `stripContext` and `stripReadout` both run on the strip's existing 1 Hz render. That cost is noise. The duplication was a maintainability item, not a bottleneck.
- Game Studio's event inspector and the Open Shop button are not on a room hot path.
- `compileEventSteps` runs when an incident starts, not on a timer.

## Opt-out checklist

Reply with decisions. Defer is the recommended default for both:

- [x] P1 — keep
- [x] P2 — defer
