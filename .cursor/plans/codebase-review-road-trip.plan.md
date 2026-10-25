---
name: Codebase review — road trip
overview: The last five commits follow ADRs 0218–0220. Remaining risk is local duplication in the trip editor and strip, plus ADR bodies that still describe the closed incident catalog.
todos:
  - id: r1
    content: "R1 — One selection in the trip map editor"
    status: completed
  - id: r2
    content: "R2 — One live-status model for the strip and Trip tab"
    status: completed
  - id: r3
    content: "R3 — Move van phase out of the hook module"
    status: completed
  - id: r4
    content: "R4 — Point superseded ADR paragraphs at 0218 and 0220"
    status: completed
isProject: false
---

# Codebase review: road trip (last 5 commits)

**Date:** 2026-10-25
**Boundary:** `feature/trips` commits `fd13dce5`..`ff91cddd` (animations/UI, Open Shop on system messages, cruising speed, trip summary, trip events), plus one hop of callers in those files. Working tree was clean.
**Depth:** standard
**Verdict:** Healthy architecture, mixed local structure. The new decisions are in the right layers; the next edit nearby will trip on two parallel status formatters and two selection ids.

Commits, oldest first: `fd13dce5` updated animations/UI, `65fa0825` Open Shop in messages, `05b8be9a` van speed with no destination, `498c3a63` trip summary, `ff91cddd` incidents generalized as events. 81 files, about +4035 / −737.

## Inventory

| Layer | What landed |
|-------|-------------|
| Map package | `map.events`, `compileEventSteps`, presets, lint, `parseTripMap` lift of `scriptedEvents` (`packages/road-trip-map`) |
| Plugin | Runner still in `plugin-road-trip/trip/incidents.ts`; copy in `trip/describeEvent.ts`; store projection of icon, refill window, `TripStore.events` |
| Web | `roadTripVanMotionMachine` + registry torn down with plugin component actors; `meta.action` on `SystemMessage`; Trip tab log (`tripLog`, narratives, `fillHeight`); strip readout |
| Game Studio | `TripEventInspector`, event pins on `TripRouteTrack`, draft helpers in `tripMapDraft.ts` |
| studio-bridge | Incident fixture reads the sample map event (`mileEvents`) instead of a hardcoded catalog id |
| Item shops | `OPEN_SHOP_ACTION` on room-shop and `ShoppingSessionHelper` opening meta |
| Docs | ADRs 0218, 0219, 0220; 0205/0207/0208 status lines; `AGENTS.md`, `PLUGIN_DEVELOPMENT.md`, `components.md`, Game Studio README |

New public surfaces: `ChatMessageAction` (`@repo/types`), `PollTheme.optionIcon`, `PluginTabComponent.fillHeight`, `TripStore.fuel.refill`, `TripStore.events`, `compileEventSteps` / `eventFromPreset` / `fuelEvent`. No new Socket.IO events. Trip logic stays in the plugin ([ADR 0006](docs/adrs/0006-plugin-system-for-room-features.md)).

## Findings

| ID | Sev | Title | Location | Rationale |
|----|-----|-------|----------|-----------|
| F1 | P1 | Editor selection is two ids that callers clear independently | `TripMapEditor` `selectedSiteId` / `selectedEventId` | Site and event inspectors, the route track, and the event list all coordinate through the parent. `selectSite` / `selectEvent` clear the other id, but `BlankSiteButton` calls `setSelectedSiteId` alone (around line 519) and site remove only clears the site id (around line 576). The render path hides a stale event while a site is selected (`selected ? … : selectedEvent`), so removing that site resurrects the previous event. Game Studio stays local React state ([ADR 0051](docs/adrs/0051-game-studio-client-sandbox.md)); this wants one union, not a machine. |
| F2 | P1 | Live trip status is formatted twice | `stripContext` and `stripReadout` in `apps/web/src/components/PluginComponents/templates/roadTrip/tripView.ts` | Fund, incident, and parked each have two copies. `RoadTripStrip` uses `stripContext` for the accessible name and `stripReadout` for the row. `RoadTripTripPanel` uses `stripContext` under the header. Cruising speed landed in `stripReadout` and `tripTabTitle` only. The next live kind has to be edited in both functions, and `tripView.test.ts` already pins both. |
| F3 | P2 | Van-motion machine imports a phase type from a hook module | `roadTripVanMotionMachine.ts` → `tripView.ts` `VanPhase` | [ADR 0004](docs/adrs/0004-state-machines-for-ui-and-socket-events.md) keeps machines as logic. The import is type-only today, but `tripView.ts` also owns `useTripStore` and `useInterpolatedVanMile`. The next edit in that file is one dropped `type` away from pulling hooks into the machine module graph. [ADR 0219](docs/adrs/0219-road-trip-van-motion-and-refill-window.md) already says the phase comes from `vanPhase(trip, mile)`. |
| F4 | P2 | Superseded decision text still reads as current | [0205](docs/adrs/0205-road-trips-v1.md) decision 12, [0207](docs/adrs/0207-trip-maps-portable-json.md) Phase 3, [0208](docs/adrs/0208-presentation-themes.md) decision 4 | Status lines point at 0220 and 0218. The bodies still specify `scriptedEvents`, `incidentSteps` as the catalog, and a poll theme with no `optionIcon`. Agents are told to implement from those ADRs. 0212's trip-summary amendment is accurate; 0205 decision 9 still describes the Trip tab as a site list. |

## Refactor plan (opt-out)

Each item is independent unless **Depends** says otherwise. Default: all included.

### R1 — One selection in the trip map editor
**Status:** completed
- **Addresses:** F1
- **Depends:** none
- **Files:** `apps/game-studio/src/components/tripMap/TripMapEditor.tsx`, and `TripRouteTrack.tsx` only if its props should take the same union
- **Change:** Replace `selectedSiteId` and `selectedEventId` with one value: `{ kind: "site", id: string } | { kind: "event", id: string } | null`. Route every add, select, and remove through setters that write that value. Keep the inspectors as they are.
- **Done means:** Adding a blank site while an event is selected, then removing the site, leaves the inspector empty. Preset sites, event rows, and pin clicks still select one thing. No new actor.
- **Risk:** Low. Selection is not persisted.

### R2 — One live-status model for the strip and Trip tab
**Status:** completed
- **Addresses:** F2
- **Depends:** none. If R3 is also kept, land R3 first so this edit happens in the pure module.
- **Files:** `apps/web/src/components/PluginComponents/templates/roadTrip/tripView.ts`, `tripView.test.ts`, `RoadTripStrip.tsx`, `RoadTripTripPanel.tsx` only if call shapes change
- **Change:** One internal description of the shared live cases (fund, incident, parked) feeds both formatters. `stripReadout` keeps the three columns, including cruising speed and phase labels. `stripContext` keeps the one-line sentence, including "Next: …". Do not unify strings that the tests already treat as different.
- **Done means:** A new `TripStoreLive` kind is branched once. Existing `stripContext` and `stripReadout` tests pass without copy changes.
- **Risk:** Medium if the shared structure forces wording to match. Keep the two exported functions and let tests reject copy drift.

### R3 — Move van phase out of the hook module
**Status:** completed. Landed in `apps/web/src/lib/roadTripVanPhase.ts` so the machine does not import from `components/`. The strip formatters moved with it.
- **Addresses:** F3
- **Depends:** none
- **Files:** new `apps/web/src/components/PluginComponents/templates/roadTrip/vanPhase.ts` (name can match a nearby pure file if one fits better), `tripView.ts`, `roadTripVanMotionMachine.ts`, `useRoadTripVanMotion.ts`
- **Change:** Move `VanPhase`, `VAN_PHASE_LABEL`, and `vanPhase` into a module with no React imports. The machine and the hook import the type from there. Leave `useTripStore` and `useInterpolatedVanMile` in `tripView.ts`.
- **Done means:** `roadTripVanMotionMachine.ts` has no import from `components/`. `roadTripVanMotionMachine.test.ts` still passes.
- **Risk:** Low. Type-only move, plus the pure `vanPhase` function.

### R4 — Point superseded ADR paragraphs at 0218 and 0220
**Status:** completed
- **Addresses:** F4
- **Depends:** none
- **Files:** `docs/adrs/0205-road-trips-v1.md` (decisions 9 and 12), `docs/adrs/0207-trip-maps-portable-json.md` (Phase 3 paragraph), `docs/adrs/0208-presentation-themes.md` (decision 4)
- **Change:** Add a one-line lead on each superseded paragraph: decision 12 and 0207 Phase 3 follow [0220](docs/adrs/0220-trip-events.md) (`map.events`, `compileEventSteps`); the Trip tab log follows [0212](docs/adrs/0212-site-narrative-chat.md); poll `optionIcon` follows [0218](docs/adrs/0218-system-message-actions-and-theme-icons.md). Leave the old sentences in place as history. Do not rewrite 0220.
- **Done means:** Someone opening 0205 or 0207 at the incident section sees 0220 before `scriptedEvents`. Status lines stay as they are.
- **Risk:** Low. Docs only. This is a drift note, not a new decision.

## Documentation updates
- [ ] R4 — superseded paragraphs in 0205, 0207, and 0208
- [ ] `AGENTS.md`, `PLUGIN_DEVELOPMENT.md`, `docs/plugins/components.md`, and `apps/game-studio/README.md` already match the code

## Explicit non-actions

- `packages/road-trip-map/src/incidents.ts` and `packages/plugin-road-trip/trip/incidents.ts` keep their names. [0220](docs/adrs/0220-trip-events.md) puts the compiler in the map package and the running incident in the plugin. `AGENTS.md` already says so.
- `IncidentSource` `"scripted"`, `scriptedFired`, and `scripted:<eventId>` thresholds stay. They are persisted trip state. 0220 did not rename them. `fireScripted` sets `incident` and `eventId` to the same map id on purpose (queue dedup vs preset id for host triggers).
- `describeTripSim.ts` stays a designer trace (`step` names, sim events). Player and export copy stay in `describeEvent.ts`, which `formatTripTimelineMarkdown` and the store projection already share. The preset-name fallback is a few lines and the sentences differ on purpose.
- No XState machine for the Game Studio map editor. The sandbox is component-local state. R1 is a union in `TripMapEditor`.
- `apps/web/src/types/ChatMessage.ts` keeps mirroring `@repo/types` by hand. `action` already uses `ChatMessageAction` from the schema. The rest of that mirror predates these commits.
- `TripEventInspector` stays one form. `RESOLUTION_FIELDS` is the extension point for a new resolution kind. Splitting it, or typing `withField` keys, can wait until a second caller exists.
- Van-motion registry teardown, `TripStore.fuel.refill`, `navigateToTarget` for the shop button, and the studio-bridge fixture match 0218, 0219, and 0220. The compiler parity test in `packages/road-trip-map/src/incidents.test.ts` is the right pin for preset behavior.

## Opt-out checklist

Reply with decisions (keep is default):

- [x] R1 — keep (done)
- [x] R2 — keep (done)
- [x] R3 — keep (done)
- [x] R4 — keep (done)
