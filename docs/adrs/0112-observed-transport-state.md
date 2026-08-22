# 0112 -- Playback snapshots distinguish "unobservable" from "stopped"

**Status:** Accepted

## Context

`PlaybackControllerApi.getPlayback()` returned a `PlaybackState` of `"playing" | "paused" | "stopped"` with no way to say "I could not read the transport at all". Two callers depended on that distinction without being able to make it:

1. The bridge's `getPlayback` treated the daemon's RPC reply as authoritative for Spotify, specifically so the API container would not poll the Spotify Web API on every admin scrubber refresh.
2. The advance job's stuck-no-media watchdog (`STUCK_NO_MEDIA_POLLS`) skips the current track after 8 consecutive polls with no duration, so that media which never becomes playable (for example a removed YouTube video) does not stall the room.

The Spotify Web Playback SDK returns `null` from `getCurrentState()` whenever the hosted player is not Spotify's active device -- after playback is transferred to another Spotify client, a socket drop and reconnect under a new device id, or a stale token. The daemon reported that as `{ state: "stopped", progressMs: null, durationMs: null }`, a well-formed and successful reply asserting nothing was playing.

That produced a queue-destroying failure mode observed in production. The empty reply blanked the progress bar, short-circuited the Web API fallback that would have reported the truth (the RPC succeeded, so the fallback was unreachable), and drove the watchdog to skip every subsequent track roughly 6 seconds in -- which is `STUCK_NO_MEDIA_POLLS` at the tightened `NEAR_END_PROBE_INTERVAL_MS` cadence, not anything about the tracks. Neither safety net caught it: `rpcFailureCount` stayed at zero because the RPC succeeded, and the daemon's own watchdog only checked `!!window.__spotifyPlayer`, which a detached player satisfies indefinitely.

## Decision

Playback snapshots carry an optional `observed?: boolean`. `false` means transport could not be read and `state` is a placeholder rather than an assertion. Omitted means observed, so existing implementers and adapters need no change.

- `DriverState` (daemon) and `PlaybackControllerApi.getPlayback()` (shared types) both carry the field.
- The Spotify SDK host reports `observed: false` when `getCurrentState()` yields nothing and its short last-good-snapshot cache has lapsed. Drivers own their own process and always know when they are stopped, so they omit the field.
- The bridge's `getPlayback` treats the daemon reply as authoritative only when `observed !== false`; otherwise it falls through to the Spotify Web API. A driver's genuine `stopped` stays actionable so unplayable media can still be skipped.
- The advance job never counts stuck-no-media polls against an unobservable snapshot. It holds the track, logs periodically, and does not broadcast the placeholder state as a playback state change.
- Device health recovery belongs to the daemon, not the API: the SDK watchdog forces a reconnect once `getCurrentState()` has stayed null past `SDK_STATE_MISSING_RELOAD_MS`, clearing the advertised device id so it is re-resolved.

### What is deliberately *not* unobservable

The bridge's `getPlayback` also returns `stopped` without contacting any device when no active source is recorded in Redis. That is not marked `observed: false`, even though we have asked nothing. An app-controlled queue is Redis-only until the advance job starts it (see the comment in `DJService.queueSongAs`: adding to the queue never dispatches), and `TOGGLE_PLAYBACK` / `PLAY_QUEUED_TRACK` are admin or owner actions. The stuck watchdog firing against that empty snapshot is therefore the only automatic way an idle room with a queue begins playing, so treating it as unobservable would leave such rooms silent until someone pressed play.

Because that branch serves two unrelated purposes, the watchdog distinguishes them by whether a track is dispatched: with one dispatched it skips as `stuck-stopped`, and with nothing dispatched it starts the next track as `idle-start`. `idle-start` is intentionally not a force-advance reason, so it can never clear a dispatched track that appeared in the meantime, and it does not announce "couldn't play".

## Consequences

Losing sight of the player now stalls one track instead of silently burning the queue, and the progress bar survives a detached SDK because the Web API fallback is reachable again. Recovery is the daemon's job and is bounded by the watchdog interval.

The trade-off is that a track which is genuinely unplayable *and* unobservable will hold rather than skip until the daemon reconnects. That is deliberate: stalling is visible and recoverable by hand, whereas skipping on a blind transport cannot help and destroys queue state. Adapters that cannot distinguish the two cases (the Spotify Web API returns an empty body both when nothing is playing and when there is no active device) must report `observed: false`, which means a genuine end-of-queue silence on those adapters is also treated as unobservable.
