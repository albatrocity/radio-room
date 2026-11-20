# 0211. User pause and play-start hold for app-controlled advance

**Date:** 2026-11-19
**Status:** Accepted

## Context

App-controlled rooms advance the Redis queue from the bridge advance job ([ADR 0040](0040-app-controlled-playback-and-ordered-queue.md), [ADR 0077](0077-bridge-composite-playback-controller.md)). That job treated several transport gaps as "this track is done":

1. An `ENDED` for the track just left after a skip or play-from-queue was still actionable. Force-advance reasons (`ended-event`, `stuck-stopped`) cleared the newly dispatched track and popped another.
2. After now-playing cleared the dispatched row, a pause that dropped position looked like idle no-media, so `idle-start` ([ADR 0112](0112-observed-transport-state.md)) started the next queue item.
3. Queue Play (`TOGGLE_PLAYBACK`) advanced unless the live snapshot was clearly mid-track. Spotify often answers a pause with no position, position 0, or `observed: false`, so Play called `playQueuedTrack` instead of `api.play()`.
4. `playTrack` posted now-playing (and therefore a playlist row + "Now playing" chat line) before any audio was confirmed, so tracks the watchdog skipped still appeared as played.

## Decision

1. **User pause record.** `DJService.togglePlayback` writes `room:{roomId}:userPause` (track id + last mid-track position) before calling `api.pause()`. While that record exists, Play resumes with `api.play()` unless the track is a **confirmed finish** (live snapshot near end, or progress reset after the stored position was already approaching the end). A blank or unobservable snapshot still resumes. The advance job does not `idle-start`, `stuck-stopped`, or apply `ENDED` while the record is set. Clear it on observed playing, on a real advance, or when a new `playTrack` starts.

2. **Play-start command (in-process).** `playTrack` records `{ at, leftTrackId, dispatchedTrackId }` in the single `@repo/adapter-bridge` module instance ([ADR 0207](0207-single-adapter-bridge-module-instance.md)). Ignore `ENDED` for `leftTrackId` or for any id that is not `dispatchedTrackId`. Do not count stuck-no-media polls until a short startup grace (`PLAY_START_GRACE_MS`) elapses; then keep the existing eight-poll threshold. Natural end of the playing / dispatched id still advances once.

3. **Deferred now-playing.** Do not post now-playing from `playTrack` until that track id is observed playing with media (`STATE` / `getPlayback`). Store title/artist/album from the play call and submit on that first playing snapshot. Shoutcast ICY remains the listener-facing report for radio; same-play dedupe collapses the follow-up ([handleRoomNowPlayingData](../../packages/server/operations/room/handleRoomNowPlayingData.ts)).

4. **Daemon pause cache.** The Spotify SDK host keeps the last mid-track snapshot across pause (including paused state) so a null `getCurrentState()` during resume still reports a position.

This narrows [ADR 0112](0112-observed-transport-state.md) only for a user pause and the startup gap after a commanded play. Unobservable transport still holds rather than skips. `idle-start` still boots an idle room that nobody paused.

## Consequences

- Queue Play resumes the paused source instead of burning the next queue items when the SDK returns a blank pause read.
- Skip / auto-advance no longer cascade through several tracks that never aired, and those tracks are not written to the playlist.
- A track that truly never produces media still skips after the startup grace + stuck polls.
- Trade-off: now-playing (and Audio Hijack metadata for non-Spotify drivers) appears a moment after audio starts rather than at the play command.
