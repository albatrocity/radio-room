# 0060. SYSTEM:PLAYBACK_STATE_CHANGED event

**Date:** 2026-06-08  
**Status:** Accepted

## Context

Plugins need to react to playback state transitions (playing ↔ paused/stopped). The primary use case is pause-aware features like Queue Pacer ([ADR 0059](0059-time-cop-playback-window-plugin.md)), which must freeze countdown timers when playback pauses and resume them when playback resumes.

The `PlaybackController` adapter interface already defines lifecycle callbacks (`onPlay`, `onPause`, `onPlaybackStateChange`), but they were effectively no-ops:

- **`AdapterService.getRoomPlaybackController`** registered per-room controllers with empty arrow functions for all playback callbacks.
- **`RadioRoomServer.registerPlaybackController`** referenced non-existent instance methods (`this.onPlay.bind(this)`, etc.) — broken, unreachable code.

Additionally, adapter callbacks only fire when **our app** calls the adapter's `play()`/`pause()` methods. When a user pauses Spotify from their phone or desktop, no callback fires. The only way to detect external pauses is polling via `trackAdvanceJob`, which already runs every second for app-controlled playback rooms.

## Decision

1. **Add `PLAYBACK_STATE_CHANGED` to `SystemEventTypes.ts`**:

   ```ts
   PLAYBACK_STATE_CHANGED: (data: {
     roomId: string
     state: "playing" | "paused" | "stopped"
     trackId: string | null
   }) => Promise<void> | void
   ```

2. **Create `handlePlaybackStateChange` operation** (`packages/server/operations/playback/handlePlaybackStateChange.ts`):
   - Emits `SYSTEM:PLAYBACK_STATE_CHANGED` via `context.systemEvents.emit`
   - **Redis-backed deduplication**: stores `room:{roomId}:playbackState` and only emits when the state transitions
   - Dedupe is essential because the Spotify adapter fires both `onPause` AND `onPlaybackStateChange("paused")` on a single pause action

3. **Wire `AdapterService.getRoomPlaybackController`** callbacks to the new operation:
   ```ts
   onPlay: () => handlePlaybackStateChange({ context, roomId, state: "playing" }),
   onPause: () => handlePlaybackStateChange({ context, roomId, state: "paused" }),
   onPlaybackStateChange: (state) => handlePlaybackStateChange({ context, roomId, state }),
   ```

4. **Fix `RadioRoomServer.registerPlaybackController`**: Replace broken `this.onPlay.bind(this)` references with no-op arrow functions. This method is unreachable (never called), but the code should at least be valid.

5. **Extend `trackAdvanceJob`** for external pause detection:
   - **State probe** runs for ALL rooms with a Spotify `PlaybackController` (not just app-controlled rooms)
   - Calls `handlePlaybackStateChange` based on `playback.is_playing`
   - The operation's Redis dedupe prevents event storms from rapid polling
   - **Track advance** logic remains gated on `isAppControlledPlayback(room)`

## Consequences

### Positive

- **Pause-aware plugins**: Queue Pacer and future plugins can subscribe to `PLAYBACK_STATE_CHANGED` for pause/resume awareness.
- **External pause detection**: Host pausing on their phone/desktop now emits the event (with ~1s detection latency from polling).
- **Deduplication**: Redis-backed dedupe prevents event storms from multiple sources (adapter callbacks + polling) firing on the same state change.
- **Clean separation**: Callback wiring lives in `AdapterService` (per-room, has `roomId` in scope); the operation owns event emission per [ADR 0014](0014-emit-domain-events-from-operations-only.md).

### Negative / Limitations

- **Polling latency**: External pauses have up to ~1s detection delay due to `trackAdvanceJob`'s 1-second cron interval. Sub-second detection would require an event-bus from Spotify (not available).
- **Spotify-only**: Other playback controllers (future) would need similar polling or native push support.

## References

- Operation: [`packages/server/operations/playback/handlePlaybackStateChange.ts`](../../packages/server/operations/playback/handlePlaybackStateChange.ts)
- Callback wiring: [`packages/server/services/AdapterService.ts`](../../packages/server/services/AdapterService.ts)
- Polling extension: [`packages/adapter-spotify/lib/trackAdvanceJob.ts`](../../packages/adapter-spotify/lib/trackAdvanceJob.ts)
- Consumer: Queue Pacer plugin ([ADR 0059](0059-time-cop-playback-window-plugin.md))
