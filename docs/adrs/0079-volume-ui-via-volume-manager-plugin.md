# 0079. Live Volume UI via Volume Manager Plugin

**Date:** 2026-07-21
**Status:** Accepted

## Context

[ADR 0078](0078-now-playing-seek-and-volume-transport.md) added first-class seek and volume Socket events and a built-in Now Playing transport UI (scrubber + broadcast volume), while removing Volume Manager’s `nowPlayingInfo` slider to avoid duplicate controls.

In practice, live volume belongs with Volume Manager’s segment presets, start-volume, and config sync. Keeping a second built-in fader splits ownership and still requires the plugin for the rest of volume behavior.

## Decision

1. **`NowPlayingTransport` is seek-only** — admin scrubber for app-controlled rooms remains built-in; do not render a broadcast volume slider there.
2. **Live volume UI returns to Volume Manager** — restore the admin-only `nowPlayingInfo` slider (`setVolume` action) when the plugin is enabled ([ADR 0069](0069-playback-controller-volume-and-before-play-hook.md)).
3. **Keep first-class volume Socket/API surface from 0078** — `SET_PLAYBACK_VOLUME`, `volumePercent` / `supportsVolume` on `PLAYBACK_STATE`, and `getPlayback.volumePercent` stay available for plugins, sync, and non-UI callers. Successful volume changes continue to go through `handlePlaybackVolumeChange`.

This **partially supersedes** ADR 0078 decisions (4) and (5) regarding built-in volume UI and hiding the plugin slider. Seek transport and the Socket events from 0078 remain in force.

## Consequences

### Positive

- One live volume control path, owned by the plugin that also owns start-volume and segment presets.
- Seek stays available without enabling Volume Manager.

### Negative / trade-offs

- Rooms without Volume Manager enabled have no Now Playing volume fader (config admin / external device volume still work).
- `SET_PLAYBACK_VOLUME` is unused by the built-in UI but remains for API completeness and future callers.

## See also

- [0069](0069-playback-controller-volume-and-before-play-hook.md) — Volume Manager + `setVolume`
- [0078](0078-now-playing-seek-and-volume-transport.md) — seek + volume Socket events (partially superseded here for UI placement)
- `packages/plugin-volume-manager/schema.ts`, `apps/web/src/components/NowPlaying/NowPlayingTransport.tsx`
