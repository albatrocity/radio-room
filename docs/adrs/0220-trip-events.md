# 0220. Trip events: incidents composed from presets

**Date:** 2026-10-24
**Status:** Accepted

## Context

Phase 3 of road trips ([0205](0205-road-trips-v1.md) decision 12, [0207](0207-trip-maps-portable-json.md)) had a closed incident catalog: four ids (`traffic-jam`, `blown-tire`, `engine-failure`, `out-of-gas`). Each id had a hand-written step list in `incidentSteps`. The engine also branched on those ids for copy (sign bodies, the "Traffic clears" and "Fuel's in" signs, item-resolved lines), for refills, and for pre-emption. Maps placed incidents with `scriptedEvents: { id, atMile, incident }`.

Authors want variations, such as a longer jam, a nail strip instead of a blown tire, or a breakdown with a pricier tow, without new code. Sites are already composed from presets ([0207](0207-trip-maps-portable-json.md), `GENERIC_SITE_PRESETS`). Incidents should be composed the same way.

Alternatives considered:

- **A raw step-list editor.** Authors would write `slow`/`window`/`fund`/`wait`/`tow` steps directly. This can express illegal sequences, such as a tow with no Mechanic or a fund after the tank has filled. It also duplicates the tow-or-shoulder branch in every map.
- **Multi-valued tags** for part behavior (e.g. `["tire", "traffic"]`). These raise precedence questions that no current item needs. Widening `family` to a list later is a cheap parse lift.

## Decision

1. **`map.events[]` replaces `scriptedEvents`.** An event is the authored definition. An incident is still the one running instance (queue, blocker, steps) in `plugin-road-trip/trip/incidents.ts`. Event fields:
   - identity, like a site: `id`, `presetId?`, `name`, `icon`, `narrative?`, `narrativeVariant?`, `clearedNarrative?`
   - `trigger`: `mile` (the default; fires at `mile`) or `fuel` (replaces Out of Gas when the tank runs dry; at most one)
   - `family`: `jam`, `flat`, `engine`, or `none` (the default)
   - `effect?`: `{ kind: "slow", factor, label? }` with `durationMinutes`, or `{ kind: "stop" }`. With no effect, the event only narrates: it does not hold the van and does not queue.
   - `resolution?`: an ordered chain of at most 8 entries: `item`, `fund`, `wait`, `tow`, `refuel`
   - `beats?`: at most 8 `{ atMinutes, narrative, narrativeVariant? }`
2. **One compiler, in `@repo/road-trip-map`.** `compileEventSteps(map, event, { mile, parts })` turns an event into the existing `IncidentStep` list when the incident starts. `tow` expands to the tow-or-shoulder branch, and `refuel` expands to the delivery fund plus a `refills` wait. `incidentSteps(map, presetId, ctx)` is a wrapper over the built-in presets (`INCIDENT_PRESETS`). Game Studio cost estimates and the plugin share it. A parity test pins the presets to the old switch's output.
3. **Families carry part behavior.** Part `immuneTo` and consumable `resolves` are keyed by family:
   - `jam`: the horn sets a floor on the slow factor and shortens the duration.
   - `flat`: Road-Grip Tires are immune.
   - An `item` entry with no `items` defaults to the family's consumables.
   - Slow steps carry `resolvesWith`, so item use checks the step, not the incident id.
4. **Copy lives in data.**
   - Start: a sign (title = name, icon = icon, body = the item or fund hint), then the event's `narrative` as chat prose ([0212](0212-site-narrative-chat.md)).
   - Cleared: "Back on the road", with `clearedNarrative` as its body.
   - Immunity copy is `immuneCopy` on the part. Item-resolved copy is `resolvedCopy` on the consumable.
5. **Behavior keys off steps, not ids.**
   - An empty tank pre-empts any incident whose current step is `slow`.
   - The gauge climbs during a `refills` wait.
   - Clearing an incident whose event has a `refuel` entry fills the tank. That entry is the only thing that fills it.
6. **Runtime snapshot.** `QueuedIncident` names the event id and source. `ActiveIncident` snapshots `name`, `icon`, `family`, `clearedNarrative`, and `refuels` when the incident starts. Host presets are not map rows, so the runner never looks them up on the map later. Log entries carry `name` and `icon`.
7. **Narrative beats** are `beat:<eventId>:<index>` thresholds, timed from when the event starts (not when it queued). `state.beatRuns` tracks them. An incident's narrative beats are dropped when it clears, whether it ends on its own, an item resolves it, or the host skips it.
8. **Host triggers are unchanged.** Quick Access fires the three built-in presets by id. Map rows cannot opt into host triggering.
9. **Compatibility.** `schemaVersion` stays 1. `parseTripMap` lifts `scriptedEvents` into `events` with `liftLegacyTripMap`, like the physical-media carry lift. Trips have not shipped.
10. **Client store.** `TripStoreLive` incidents and `TripStoreIncident` carry `icon`, and `incident` is a plain event id. Clients no longer look up a catalog for the strip.
11. **Lint** adds:
    - errors: `event-missing-mile`, `fuel-event-with-mile`, `fuel-event-without-refuel`, `multiple-fuel-events`, `slow-without-duration`, `stop-without-resolution`, `beat-not-after-start`, `unknown-event-item`
    - kept: `duplicate-event-id`, `event-beyond-route`, `no-mechanic` (now any `tow` entry), and `non-cdn-asset` (sites only)

## Consequences

- Events have no image or model; players see the icon. Adding art later is a schema addition.
- New variations are JSON: a different factor, duration, cost, wait, copy, or narrative beats. Game Studio stamps them from presets.
- The four built-in incidents behave as before. The visible change is that the story sentence moves from the start sign's body into chat prose, and the clear signs read "Back on the road" with the event's cleared copy.
- A custom event gets horn or Road-Grip behavior only through `family`. A `none` slowdown is not softened by the horn.
- `tow` and `refuel` hide a branch inside one entry. Authors tune its costs and waits; they cannot hand-write the shoulder alternative.

## See also

- [0205. Road trips v1](0205-road-trips-v1.md) (decision 12, now partially superseded)
- [0207. Trip Maps as portable JSON](0207-trip-maps-portable-json.md) (`scriptedEvents` shape, now partially superseded)
- [0212. Site narrative is chat prose](0212-site-narrative-chat.md)
