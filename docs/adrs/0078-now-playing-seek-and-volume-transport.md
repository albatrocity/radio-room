# 0078. Now Playing Seek and Volume Transport Controls

**Date:** 2026-07-21
**Status:** Accepted

## Context

App-controlled rooms increasingly play via the bridge daemon (Spotify Web Playback SDK device, local/mpv, YouTube, Tidal) rather than a host-facing Spotify.app UI. Admins still need to seek within the current track and adjust broadcast volume. Live volume today is only reliable when the optional Volume Manager plugin is enabled ([ADR 0069](0069-playback-controller-volume-and-before-play-hook.md)); seek is implemented on `PlaybackControllerApi.seekTo` but never exposed over Socket.IO.

Play/pause already exists as first-class Socket events (`TOGGLE_PLAYBACK` / `GET_PLAYBACK_STATE`) for room admins. Seek and volume should follow the same pattern so controls are always available in Now Playing, independent of plugin enablement.

## Decision

1. **First-class Socket events** (admin/creator, app-controlled rooms only, same gates as `TOGGLE_PLAYBACK`):
   - `SEEK_PLAYBACK` with `{ positionMs }` → `PlaybackControllerApi.seekTo`
   - `SET_PLAYBACK_VOLUME` with `{ volumePercent }` → `PlaybackControllerApi.setVolume` when present
2. **Extend `GET_PLAYBACK_STATE` / `PLAYBACK_STATE`** to include `progressMs`, `durationMs`, `volumePercent`, and `supportsVolume` so the admin UI can render a scrubber and volume slider without a plugin store.
3. **Optional `volumePercent` on `getPlayback` return** — controllers that know device/driver volume include it; bridge may fall back to Redis `last_volume`.
4. **Built-in Now Playing transport UI** (`NowPlayingTransport`) for admins — scrubber + broadcast volume. Distinct from listener stream volume in `RadioControls`.
5. **Volume Manager coexistence** — keep config / `startVolume` / `beforePlayQueuedTrack` / `PLAYBACK_VOLUME_CHANGED` listeners; remove the plugin’s `nowPlayingInfo` live slider so admins do not see two volume controls. Successful `SET_PLAYBACK_VOLUME` still calls `handlePlaybackVolumeChange` so plugin config stays in sync.
6. **Skip-to-next remains out of scope** — queue advance and plugin `skipTrack` are unchanged.

## Consequences

### Positive

- Admins can seek and set volume for bridge/local/Spotify without enabling a plugin or using a native player UI.
- Transport control stays in the DJ controller layer, consistent with play/pause.
- Volume Manager’s segment/start-volume features remain useful without duplicating the live fader.

### Negative / trade-offs

- Client polls `GET_PLAYBACK_STATE` (~5s) for scrubber re-anchor; local interpolation fills between polls. Bridge Spotify reads SDK `getCurrentState` via daemon RPC (not Spotify Web API every poll).
- Seek near track end can still race the advance job (same as Spotify Connect today).
- Volume Manager’s Now Playing slider is gone; rooms that relied only on the plugin UI must use the built-in control.

## See also

- [0069](0069-playback-controller-volume-and-before-play-hook.md) — `setVolume` + Volume Manager
- [0075](0075-bridge-composite-playback-controller.md) / [0076](0076-spotify-web-playback-sdk-device.md) — bridge playback
- `packages/server/services/DJService.ts`, `apps/web/src/components/NowPlaying/NowPlayingTransport.tsx`
