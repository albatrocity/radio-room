# 0206. Trip timeline in the room export

**Date:** 2026-10-02
**Status:** Accepted

## Context

A road trip ([0200](0200-road-trips-v1.md)) is part of the show's story: where the van went, which exits the room took or skipped, and when it arrived. The room export ([data and export guide](../plugins/data-and-export.md)) is how a show is kept after publish. Only its Markdown is persisted, and plugin storage is deleted with the room. If the trip isn't in the export, it's lost.

## Decision

1. **Every transition logs.** `mutateTrip` appends `TripLogEntry` rows to `trip:log` (`appendCapped`, 3000) in the same transition as the state change. Phase 1 logs:
   - `departed`
   - `site`, with phase `revealed | poll | stopped | skipped | departed`, plus vote counts and a `defaulted` flag
   - `pause` and `resume`
   - `arrived`, `late`, and `stranded`
2. **A pure formatter.** `formatTripTimelineMarkdown({ map, state, log, timeZone })` in `plugin-road-trip/export` writes a "Road Trip Timeline" section with these parts:
   - A summary table: map and revision, departed and arrived against the target, drive and parked time, and site counts.
   - A timeline table with time, T+ from departure, mile, and event.
   - "revealed" entries are logged but not shown as rows.
3. **`augmentRoomExport`.** It returns the Markdown section and `{ summary, log }` as `pluginExports["road-trip"]`. It returns nothing before departure. On failure it logs a warning and returns nothing, so the export itself never fails.
4. **Timezone from config.** Clock times use the new `exportTimeZone` config field (IANA zone, default `UTC`). Road-trip has no show context of its own.
5. **Retention.** `trip:legs`, `trip:log`, and `trip:map` survive session end and arrival and have no TTL. They are cleared by "New trip", "Unload map", or deleting the room. Every plugin is initialized in every room, so the section is included even after a `replace` activation disabled road-trip.

## Consequences

- The published show keeps a readable trip record without new persistence.
- Hosts should end the trip before publishing, so the timeline has an ending.
- Phase 2 adds `fund` and `fuel` log events ([0204](0204-trip-funds-escrow-pool-and-levy.md)):
  - The timeline shows each fund with its fill folded in ("⛽ Gas 'n' Go: 108 coins from 2 travelers, filled 13.5 gal", plus a note when short), and low and empty fuel rows.
  - The summary gains a Money row.
  - A Travelers table lists coins paid per listener.
- Phase 3 adds `incident` and `part-installed` log events:
  - The timeline shows each incident's start (marked "scripted" when it came from the map), immunity, the item or AAA card that resolved it, tows ("🚚 Towed 3 mi to Hank's Garage"), host skips, and the end. Fund rows name their purpose (roadside, tow, repair, delivery), and a waived fund says so.
  - The summary's Money row counts incident costs, and a new Incidents row counts incidents and tows.
  - The Travelers table gains a Parts column listing who installed what.
- The timezone is a per-room config value. If shows ever carry a timezone, the formatter should prefer it.
