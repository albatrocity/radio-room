# 0200. Road trips v1: a ledger of legs, trip mode as a loaded map, sites as timed stops

**Date:** 2026-10-02
**Status:** Accepted

## Context

Rooms are for chatting and queueing music. Item Shops and game sessions give listeners things to buy and earn, but no shared story or goal. A road trip gives them one: a van drives a route in real time, the room votes at exits, and stops open shops. It has to pass an **ignorability test**: a listener who never opens the Game modal, never votes, and never buys anything sees the same chat and queue as in a room without a trip, plus a few road-sign messages and one slim strip.

Constraints:

- The API runs on several dynos. Anything that ticks per second (van position, countdowns) would mean timers on every dyno and a socket emit per second.
- A `replace` segment activation rewrites plugin config and can set `enabled: false`. A trip must survive that.
- Hosts already run the show through segments. The trip must not compete with them.

The full design is in `plans/road-trip-v1/plan.md`. This ADR records Phase 1 (drive and stop). Fuel and funds (Phase 2), van parts and incidents (Phase 3), and site art (Phase 4) will amend it or get their own ADRs.

## Decision

1. **New plugin `@repo/plugin-road-trip`**, registered in `apps/api`. Pure trip logic lives in `trip/` (`ledger`, `state`, `transitions`, `thresholds`, `projection`, `commit`). Storage access is in `trip/store.ts`, and `index.ts` is the only place with side effects.
2. **The programme and the trip are independent (D1).** Segments never move the van, and the trip never reads or activates segments. On arrival the trip privately nudges the room creator to activate the next segment.
3. **Trip mode means "a map is loaded" (D2).** Road-trip is in trip mode whenever `trip:map` exists in its plugin storage, whatever its `enabled` flag says. `enabled` only shows road-trip in Quick Access. Two pieces of core support make this work:
   - `Plugin.schedulesIgnoreEnabled` (new, optional). The registry fires durable schedules ([0190](0190-durable-plugin-scheduler.md)) for plugins that set it even when their config has `enabled: false`. Road-trip sets it. Event handlers already run regardless of `enabled`, because plugins gate themselves.
   - Every registered plugin is initialized in every room, so `augmentRoomExport` still runs after a `replace` activation.
4. **Progress is a ledger of legs (D3–D5).** A leg is piecewise-constant motion (`at`, `mph`, plus `mile` and `gallonsUsed` prefix sums). The leg in force lives in `trip:state` as `leg`, so a transition and its leg commit in the same CAS; `trip:legs` (`appendCapped`, 5000) is append-only history for the export. Speed is `driving && no blockers ? baseMph × Π speed factors : 0`. Pause, parking, and stops are **blockers**. There are two motion primitives, speed factors and blockers, and later features compile to them. Nothing ticks:
   - Thresholds (reveal, skip-poll, arrive, blocker expiry) are solved from the current leg and armed as durable schedules under fixed ids (`reveal:<site>`, `skip-poll:<site>`, `arrive:<site>`, `expire:<blocker>`). `trip:armed` maps each armed id to its fire time: unchanged future schedules aren't rewritten, and ids no longer wanted are cancelled. A fired schedule is removed from `trip:armed` before its handler runs.
   - The server emits only when something changes. Clients interpolate the van's mile from `{ anchorAt, anchorMile, mph }` on the shared 1 Hz ticker (`interpolateVanMile` in `@repo/road-trip-map`).
5. **One write path: `mutateTrip(transition)`.** Inside `storage.updateJson` (CAS), `applyTransition` projects the van from the state's own `leg`, runs a pure transition `(state, { now, mile, map }) → { next, log, effects } | null`, and commits the new leg into the same state. Nothing is read outside the CAS that the write depends on. After a successful write:
   1. Append the new leg (if the rates changed) to `trip:legs` history.
   2. Append to `trip:log`.
   3. Run the effects once: signs, shop open and close, poll close, host nudge.
   4. **Settle:** re-read the latest state, re-solve and re-arm thresholds from it, and publish one `TRIP_UPDATED` store event. Settles are serialized per process, and a pass repeats if the state version moved underneath it, so a slow mutation can never cancel a newer one's schedules or publish over it.

   Threshold handlers re-read state and check `tripId`, so duplicate or stale schedule fires are no-ops. A handler that changes nothing still settles (without publishing), so a threshold that fired early is re-armed.
   - The parsed map is cached in memory by content hash (`TripState.map.hash` names the current one), so publishes and component-state reads don't re-read it.
6. **Lifecycle (statuses `loaded → driving → arrived | late → ended`, `stranded` if ended early).**
   - Departing requires an active game session (D7).
   - Pause and resume add and remove an `admin-pause` blocker.
   - Ending the game session mid-trip pauses with reason "No game session", and starting one resumes.
   - "Leave now" ends the current stop early.
   - "New trip" keeps the map, clears legs, log, and state, and issues a new `tripId`. It is refused while driving.
   - "Unload map" leaves trip mode, and is also refused while driving.
   - The map can be replaced until departure, then it is locked.
   - Park timers and other durations run on the wall clock (D8).
7. **Sites (D10–D12c).**
   - Sites are sorted by mile, and the destination is the last one. Sites are optional unless `mandatory`, and the destination is always mandatory. Sites must be at least 0.1 mi apart (a map error), and an arrival waits while the van is parked at another site.
   - An optional site opens a core skip poll ([0152](0152-plugin-authored-core-polls.md), [0189](0189-poll-closes-at-auto-close.md)) `leadMinutes` before the exit, with `announce: false` and a road-sign presentation ([0203](0203-presentation-themes.md)).
   - The options are always "Pull off" and "Keep driving", in that order. A tie or no votes uses the site's default, which falls back to the map's `tuning.skipPoll.default` ("Keep driving" unless the map says otherwise).
   - If another poll is open, the skip poll retries every 5 s. If it still can't open 15 s before the exit, the default applies.
   - **Reveal (fog of war):** a site reveals at the earlier of being within `revealMiles` of the van or its poll opening. Reveals never undo. A `secret` site is hidden entirely until revealed. A `mystery` poll names nothing, and its site reveals on arrival.
   - **Stop:** the van parks for `parkMinutes` with a `parked` blocker and the site becomes `visited`.
   - **Parking time** is planned in one place, `parkPlan` in `@repo/road-trip-map`: mandatory stops, the stops expected if nobody votes, and every stop. The departure target is drive time plus expected stops (unless `deadlineAt` is set), the live ETA uses the same helper with known decisions, and the deadline lint and Game Studio projections use it too. Road-trip asks Item Shops to open the site's shop ([0201](0201-declared-plugin-capabilities.md)) and closes it when the van leaves.
   - Lore reaches clients only once a site is visited. A skipped site stays locked for the rest of the run.
8. **Spoiler-safe store payload.** The map stays in server-only storage. The `trip` store key carries a projection (`TripStore`, `@repo/road-trip-map`):
   - Unrevealed sites send only `{ id, mile, state }`, and secret ones are omitted.
   - Lore is sent only after a visit.
   - `live` describes a parked stop (with `endsAt` and whether the shop is open) or a pause.
9. **UI is one strip plus a tab (D24).**
   - The strip is `road-trip-strip` in `aboveChat`, one line about 32 px tall, and viewers can collapse it. It shows the route line, the van dot, and "Next: …" or the live context. Tapping it opens the Trip tab.
   - The **Trip** Game State tab (`road-trip-trip-panel`) shows the route, the visited count, the ETA, and a site list.
   - Site detail (`road-trip-site-detail`) opens on the Game State nav stack ([0106](0106-game-state-nav-machine.md)) through a new generic **plugin detail frame** `{ kind: "plugin", pluginName, view, params }`. The frame renders any registered template component with params, so plugins get detail pages without a dedicated frame kind.
   - Every trip message goes through one `tripAnnounce()` helper and renders as a road sign.
10. **Two small generic seams on the web.**
    - **Store-aware tab `showWhen`.** `checkShowWhenConditions` now also reads the plugin store, through the shared plugin component actors ([0093](0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md)). The Trip tab shows only when `tripActive` is true. Config conditions are still checked first, so existing tabs behave as before. The tab list subscribes through `usePluginStoresSelector`, which reduces the stores to the set of visible tab ids, so the room-wide provider re-renders only when that set changes.
    - **Quick Access live status ([0074](0074-quick-access-admin-panels.md)).** A read-only Quick Access field whose key also exists in the plugin's store shows the live store value. Road-trip's `tripProgress`, `tripEta`, `tripNextSite`, and `tripWarnings` are computed on every publish, so status never needs a config write. Unsaved form edits are not reset.

## Consequences

- No per-second server work or socket traffic. A trip costs a few durable schedules and one store emit per transition.
- Correctness depends on every transition being pure and every handler being idempotent. The ledger and transitions have exhaustive unit tests ([0007](0007-unit-tests-for-platform-critical-behavior.md)), plus an integration test that plays a whole trip on fake timers.
- `schedulesIgnoreEnabled` is a sharp tool. A plugin that sets it must decide for itself when its schedules should do nothing (road-trip uses "no map loaded").
- Skip polls share the room's single poll slot. Under heavy poll use, sites fall back to their defaults instead of blocking.
- The plugin detail frame and store-aware `showWhen` can be reused by other plugins.
- Fuel, funds, van parts, and incidents (Phases 2–3) build on the same ledger primitives and amend this ADR.

## See also

- [0201. Declared plugin capabilities](0201-declared-plugin-capabilities.md)
- [0202. Trip Maps as portable JSON](0202-trip-maps-portable-json.md)
- [0203. Presentation themes](0203-presentation-themes.md)
- [0206. Trip timeline in the room export](0206-trip-timeline-room-export.md)
- [0190. Durable plugin scheduler](0190-durable-plugin-scheduler.md)
- [0192. Plugin storage helpers](0192-plugin-storage-and-leaderboard-helpers.md)
