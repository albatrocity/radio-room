# 0059. Time Cop Playback Window Plugin

**Date:** 2026-06-08  
**Status:** Accepted

## Context

Shows often have a fixed end time (e.g., a radio slot ends at 3:00 PM). When the queue is long and tracks run their full duration, shows can overrun their allotted time. DJs must either manually skip tracks or accept that some queued songs won't be heard.

The goal is to **dynamically compute per-track playback windows** so that all queued tracks get at least some airtime before the show ends. Tracks that exceed their computed window are automatically skipped (unless an admin intervenes).

Key requirements:

- **Dynamic window calculation**: `(endTime - now) / remainingTracks`, floored at a configurable minimum
- **Pause awareness**: When playback pauses (host pauses on Spotify, etc.), the countdown freezes; when playback resumes, the deadline shifts forward
- **Admin override**: "Let it play" button saves a track from being skipped
- **Track detection gating**: Time Cop requires `fetchMeta: true` to know when tracks change

## Decision

Implement a **`@repo/plugin-time-cop`** plugin following the existing plugin architecture ([ADR 0006](0006-plugin-system-for-room-features.md)).

### Configuration

```typescript
{
  enabled: boolean           // Toggle the feature on/off
  endTime: number | null     // Target end time (epoch ms)
  minPlaybackMs: number      // Minimum playback window (default 30s)
  warnOnOverrun: boolean     // Post chat warning when queue will overrun
}
```

Validation via Zod `superRefine`: when `enabled: true`, `endTime` must be at least 1 minute in the future. The `fetchMeta` gate is enforced at runtime in the plugin (since Zod validation is pure/sync and can't read room state).

### Runtime State

```typescript
{
  currentTrackId: string | null
  currentDeadline: number | null     // epoch ms when track should be skipped
  currentTrackSkipCanceled: boolean  // admin clicked "Let it play"
  isPaused: boolean
  pausedRemainingMs: number | null   // time remaining when paused
}
```

### Event Flow

1. **Activation**: Admin saves config with `enabled: true` + `endTime` → `onConfigChange` detects transition → emits `PLUGIN:TIME_COP:ACTIVATED` → `armCurrentTrack()` starts a timer
2. **Track/queue changes**: `TRACK_CHANGED` resets the cancel flag and re-arms; `QUEUE_CHANGED` re-arms (window may shrink/expand)
3. **Timer fires**: If queue has items, call `api.skipTrack()` + emit `TRACK_SKIPPED`. If this is the last track, emit `LET_IT_FINISH` (no skip).
4. **Pause/resume**: `PLAYBACK_STATE_CHANGED` ([ADR 0060](0060-playback-state-changed-system-event.md)) → paused: freeze timer, capture remaining time; playing: shift deadline, restart timer
5. **Admin cancel**: `executeAction("cancelCurrentTrackSkip")` (admin-gated) clears timer, sets `currentTrackSkipCanceled`, emits `SKIP_CANCELED`
6. **Deactivation**: `enabled` flips to false → `clearAllTimers()`, reset state, emit `DEACTIVATED`

### UI Components

Declarative components via `getComponentSchema()`:

- **Countdown** (`nowPlayingInfo`): Shows time remaining before skip, resolves duration from store key `perTrackWindowMs`
- **Paused indicator** (`nowPlayingInfo`): Replaces countdown when paused
- **"Let it play" button** (`nowPlayingInfo`): `adminOnly: true`, invokes `cancelCurrentTrackSkip` action
- **"Saved" badge** (`nowPlayingBadge`): Shown after admin cancels a skip

### Dependencies

- `SYSTEM:PLAYBACK_STATE_CHANGED` event ([ADR 0060](0060-playback-state-changed-system-event.md)) for pause awareness
- `adminOnly` prop on `ButtonComponentProps` for admin-only UI
- `datetime` field type in `PluginFieldType` for end time picker
- `CountdownComponent` store-key resolution for dynamic durations

## Consequences

### Positive

- **Fair airtime**: All queued tracks get heard (at least partially) before the show ends
- **Automatic enforcement**: No manual DJ intervention required
- **Pause-aware**: Hosts can pause without losing countdown time
- **Admin override**: Edge cases (great song, guest artist) can be saved
- **Predictable UX**: Countdown shows exactly when the track will be skipped

### Negative / Limitations

- **Minimum playback floor**: If the queue is too long, tracks hit `minPlaybackMs` and the show overruns (with a chat warning)
- **Single-instance only**: No distributed timer coordination; duplicate events are cosmetic (acceptable for current deployment)
- **No sound effects**: Skip sound effects deferred to a future `SYSTEM:*` skip event + `local-remote` integration
- **Client-side `adminOnly`**: The button visibility is client-side only; server-side `executeAction` re-verifies admin role for defense in depth

## References

- Plugin: [`packages/plugin-time-cop/`](../../packages/plugin-time-cop/)
- Pause event: [ADR 0060](0060-playback-state-changed-system-event.md)
- Plugin system: [ADR 0006](0006-plugin-system-for-room-features.md)
- Domain event pattern: [ADR 0014](0014-emit-domain-events-from-operations-only.md)
