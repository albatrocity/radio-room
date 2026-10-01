# 0196. Plugin playback timeline (transport and playback-anchored schedules)

**Date:** 2026-10-01
**Status:** Accepted

## Context

Plugins can read the current `QueueItem`, skip, and set volume, but they cannot see the playhead or move it. The playback controller already exposes `getPlayback` (state, `progressMs`, `durationMs`), `play`, `pause`, and `seekTo`; only admin socket paths in `DJService` use them.

Durable plugin timers ([ADR 0190](0190-durable-plugin-scheduler.md)) are wall clock only. That is right for game timers (Lyric Hero / Quiz Sessions auto-advance), but wrong for timers that describe the music. Absent DJ's `skipDelay` should mean "this much of the absent DJ's track has played": pausing the room should not burn the countdown down.

## Decision

### 1. Plugin transport

`PluginAPI` gains:

- `getPlayback(roomId)` → `{ success: true, state, trackId, progressMs, durationMs } | { success: false, message }`. Allowed whenever the room's controller implements `getPlayback` (any room type). Shared with anchored schedules through `operations/playback/readRoomPlayback.ts`.
- `pausePlayback(roomId)`, `resumePlayback(roomId)`, `seekPlayback(roomId, positionMs)`. App-controlled rooms only, matching `DJService.seekPlayback` / `togglePlayback`. Resume calls `api.play()` and never auto-advances the queue. Seek clamps to the track duration like the admin path.

Trust matches `skipTrack` ([ADR 0153](0153-plugin-authored-queue-split.md)): scoped plugin identity, no admin gate. Every mutation (plugin or admin) clears the `DJService` playback-state cache through the exported `clearPlaybackStateCache(roomId)`.

### 2. Anchored schedules

`schedule()` accepts `anchor` instead of `at` / `durationMs`:

| Anchor | Fires when | Paused while |
| --- | --- | --- |
| `{ afterPlaybackMs }` | that much playback has elapsed | `state !== "playing"` |
| `{ atProgressMs }` | the playhead reaches the position | `state !== "playing"` |
| `{ leadMs }` | `leadMs` before the track ends | `state !== "playing"` |

Each accepts optional `trackId` (`QueueItem.mediaSource.trackId`). When `TRACK_CHANGED` names a different track, the schedule is cancelled.

Storage stays on the ADR 0190 ZSET + payload hash. The payload entry carries the anchor plus `paused` and `remainingMs`. A running anchor is a normal ZSET member scored by `fireAt`; a paused anchor is **removed from the ZSET** (so the sweep cannot claim it) and lives only in the payload hash. A per-room set `plugin:schedules:anchored:{roomId}` lists anchored members so transport changes can find them without scanning.

### 3. Recompute rule

There is no progress poll. `recomputeAnchoredSchedules(roomId, observed?)` runs when this server already learns about transport:

- plugin `pausePlayback` / `resumePlayback` / `seekPlayback`
- admin `DJService.seekPlayback` / `togglePlayback`
- `handlePlaybackStateChange` when it emits `PLAYBACK_STATE_CHANGED`
- `TRACK_CHANGED` (after cancelling mismatched `trackId` anchors)

Callers pass what they just did (`state`, `progressMs`) so a stale controller read right after a command does not undo it. Recompute exits after one `SCARD` when the room has no anchors, and reads the controller only when a playhead anchor needs progress.

Concurrency with the sweep uses ownership of the ZSET member: pause transitions claim with `ZREM` (and back off if the sweep already won), running-to-running moves use `ZADD XX`. The sweep skips members whose payload is gone instead of dispatching an empty `kind`.

### 4. Revision callback

When recompute pauses, resumes, moves (by more than 500 ms), or cancels an anchor, `PluginRegistry.dispatchScheduleRevised` calls `plugin.handleScheduleRevised({ scheduleId, kind, fireAt, paused, remainingMs, cancelled })`. `BasePlugin.onScheduleRevised(handler)` registers it. Plugins use it to keep countdown UI honest.

### 5. Fallback

If the controller is missing, lacks `getPlayback`, or the read fails, `afterPlaybackMs` falls back to a wall-clock `durationMs` schedule and `schedule()` returns `anchored: false`. Playhead anchors (`atProgressMs`, `leadMs`) fail with `{ ok: false }` because there is nothing to fall back to.

### 6. Bounds

The first delay still has to be 1s–7d. A paused anchor may wait longer than 7d; it is not in the ZSET while paused.

### 7. Consumers

Absent DJ's skip countdown uses `{ trackId, afterPlaybackMs: skipDelay }` and freezes its countdown component while paused (`pausedRemainingKey` on the `countdown` template). Lyric Hero and Quiz Sessions stay on wall-clock `durationMs`: they are game timers, not playback timers.

## Consequences

- Plugins can build timeline games (intro guessing, end-of-track finales, freeze games) on durable, multi-dyno-safe schedules.
- Seeks made outside this server (a phone) do not move `atProgressMs` / `leadMs` anchors until the next recompute trigger. `afterPlaybackMs` is unaffected by seeks.
- One extra `SCARD` on each playback state transition and track change for rooms without anchors.

## See also

- [0190](0190-durable-plugin-scheduler.md) — durable plugin scheduler (extended here)
- [0069](0069-playback-controller-volume-and-before-play-hook.md) — playback controller volume and plugin pass-through
- [0153](0153-plugin-authored-queue-split.md) — plugin trust model for sensitive APIs
