# 0215. The van shares playback formats while a trip map is loaded

**Date:** 2026-10-19
**Status:** Accepted

## Context

[0160](0160-playback-device-gating.md) gates queueing a Physical Media record on a held playback device whose `playbackFormats` covers the record's format. [0166](0166-hifi-playback-devices-skip-wear.md) lets hi-fi devices skip wear.

Trip stops now sell records ([0214](0214-physical-media-carry.md)). A traveler who buys a country CD at a stop and holds no CD player can't play it, so the purchase feels broken. On a road trip the van has a stereo; it should count as a playback device for everyone in the room while the trip is on.

Item Shops owns queue gating, Road Trip owns the map, and plugins talk only through declared capabilities ([0206](0206-declared-plugin-capabilities.md)).

## Decision

1. **The map declares the van's stereo.** `tuning.vanPlayback: { formats, gentle }` in the Trip Map schema. `formats` defaults to all four Physical Media formats and `gentle` to `false`. Game Studio's trip settings have "Van plays" format checks and a "Van plays records without wear" checkbox.
2. **`resolveTripTuning(map)`** in `@repo/road-trip-map` returns the tuning a trip runs with (today `map.tuning` unchanged). Road Trip reads `vanPlayback` only through it, so a future van loadout can override it in one place.
3. **`shopAccess.setSharedPlayback(ownerId, { formats, gentle? })`.** Item Shops keeps one entry per owner in its room-scoped plugin storage (`shared-playback`). Empty `formats` clears that owner. Owners' formats union.
4. **One gating check.** `validateQueueRequest` unions the shared formats into `playableFormats(items, shared)`. `wearRecordForQueue` unions gentle owners' formats into `gentlePlayableFormats(items, shared)`. Owning the record is still required; only the device requirement is relaxed. A held hi-fi device still skips wear when the van doesn't.
5. **Road Trip keeps it in sync.** `syncVanPlayback` sets the map's `vanPlayback` when a map is loaded and the plugin is enabled, and clears it otherwise. It runs on load, on unload, when `enabled` changes, and on register (so it re-asserts after a restart). "Map loaded" is trip mode ([0205](0205-road-trips-v1.md), D2), so this covers the whole trip without tracking departure.
6. **Lint warns about mismatches.** A site whose `services.physicalMedia` sells a format the van can't play gets a `van-cannot-play` warning. A site with no formats listed sells every format, so it warns only when the van doesn't play all four.

This amends [0160](0160-playback-device-gating.md): held devices are no longer the only source of playable formats.

## Consequences

- Records bought on the road play in the van. Authors can make a trip harder (a tape-only van) or gentler (no wear).
- Shared playback lives in Item Shops storage, so it can outlive Road Trip's state. Road Trip clears it on unload and disable and re-asserts it on register. If Item Shops is disabled and re-enabled mid-trip, the entry is still in storage, which is the desired state.
- Any future plugin (a jukebox bar, a venue) can lend formats the same way under its own owner id.
- One extra storage read on queue requests that reach the durable-record branch in restricted Local rooms.

## See also

- [0160. Playback-device gating](0160-playback-device-gating.md)
- [0166. Hi-fi playback devices skip wear](0166-hifi-playback-devices-skip-wear.md)
- [0205. Road trips v1](0205-road-trips-v1.md)
- [0214. Physical media carry](0214-physical-media-carry.md)
