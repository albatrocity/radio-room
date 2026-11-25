# 0233. Site parked-status override

**Date:** 2026-10-29
**Status:** Accepted

## Context

While the van is stopped, the strip's status word is always "Parked", and the trip log says "Parked here". A stop like a moon crater wants its own word ("Investigating") without changing the exit sign, which already says how long the van is parked ([0220](0220-site-narrative-chat.md)).

## Decision

1. **`site.parkedStatus`** is an optional string, 1–40 characters. `schemaVersion` stays 1. Blank means "Parked".
2. **While the van is parked at that site**, the strip status and the one-line context use that word instead of "Parked". The trip log and the site detail badge use it instead of "Parked here".
3. **The store sends it only for the current stop.** `TripStoreLive` of kind `parked` carries `status`, and the site row carries `parkedStatus`, both only while that site's phase is `parked`.
4. **The exit sign stays "Parked for N min."** An incident or a fund that holds the van still replaces the status with its own headline.

## Consequences

- Authors set one word per stop in Game Studio's Stop card. Other stops keep "Parked".
- A long word truncates on the strip. The trip log shows the full string.
- The word is not on the store before the van parks, so a revealed stop ahead does not advertise it.

## See also

- [0220. Site narrative is chat prose](0220-site-narrative-chat.md)
- [0227. Road-trip van motion and refill window](0227-road-trip-van-motion-and-refill-window.md)
