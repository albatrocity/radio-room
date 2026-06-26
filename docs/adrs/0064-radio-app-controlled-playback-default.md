# 0064. App-Controlled Playback Default for New Radio Rooms

**Date:** 2026-06-26  
**Status:** Accepted

## Context

[ADR 0040](0040-app-controlled-playback-and-ordered-queue.md) introduced `Room.playbackMode` with `"spotify-controlled"` as the implicit default when unset. Radio rooms benefit from app-controlled queues (ordered Redis queue, reorder support, game-ready mechanics), but admins had to opt in manually after every room creation.

Existing radio rooms may have been running without a stored `playbackMode` and rely on Spotify-native queue mirroring. Changing runtime defaults for unset fields would alter behavior for those rooms without an explicit admin choice.

## Decision

1. **New radio rooms** created via `withDefaults` persist `playbackMode: "app-controlled"` at creation time.
2. **Existing rooms** with no stored `playbackMode` continue to behave as Spotify-controlled (`isAppControlledPlayback` unchanged).
3. Admin DJ Features UI shows app-controlled as the selected option for radio rooms when `playbackMode` is unset (display-only; does not change runtime for legacy rooms until saved).

This supersedes the creation-time default described in item 1 of [ADR 0040](0040-app-controlled-playback-and-ordered-queue.md) for radio rooms only. Unset still means Spotify-controlled at runtime for backward compatibility.

## Consequences

- New radio rooms get ordered queue semantics and track-advance job behavior without an extra admin step.
- Legacy radio rooms are unaffected until an admin saves DJ Features or a segment override sets `playbackMode`.
- Jukebox and live room types are unchanged.
