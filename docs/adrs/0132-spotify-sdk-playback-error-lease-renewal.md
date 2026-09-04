# 0132. Spotify SDK playback_error reconnects the device and reattaches playback

**Date:** 2026-08-28
**Status:** Accepted

## Context

The bridge hosts a Spotify Web Playback SDK player in Chrome as a Connect device ([0078](0078-spotify-web-playback-sdk-device.md)). After that device sits paused for a while, the next play/resume fails with the SDK's generic `playback_error: Playback error`. A Chrome tab refresh fixes it.

The hung state is not the "blind device" case in [0112](0112-observed-transport-state.md). `window.__spotifyPlayer` is still present, and `getCurrentState()` still returns a paused snapshot (track, duration, position 0). The existing watchdog therefore never reloads. `player.resume()` / `activateElement()` also return without starting audio: Spotify has dropped the Web Playback / Widevine lease bound to that Player instance, while the JS object still looks healthy.

Playback **commands** stay on the server-side Web API ([0078](0078-spotify-web-playback-sdk-device.md)). That API often accepts `startResumePlayback` (204) even though the SDK then fails locally, so the play call has already returned before the error appears in the tab.

## Decision

1. **Forward `playback_error`** from `spotify.html` to the daemon (`__bridgeSpotifyError`), same as the other SDK error listeners.
2. **Renew the lease in the daemon** by disconnecting the current Player and connecting a new one (`__spotifyRecreatePlayer`). That issues a new Connect `device_id` without tearing down the CDP CORS intercept. Fall back to reloading `spotify.html` if the helper is missing. Cap at two attempts until a playing snapshot is observed, so an unplayable URI cannot reload-loop.
3. **Reattach the existing Web API context** once the new player fires `ready`: `PUT /me/player` with `{ device_ids: [id], play: true }`. This is the narrow exception to "SDK page is a passive audio device": the daemon does not choose a URI; it moves Spotify's already-commanded playback onto the renewed device so the play that failed can actually start. Suppress the 15s blind-device watchdog while reconnecting so it does not immediately reload the new, not-yet-active player.

## Consequences

- A long-paused SDK device recovers on the next failed play without a human refreshing Chrome.
- An unplayable track still errors after two reconnects and then sits until the advance job / a human skips it. The attempt counter decays after two idle minutes so one bad episode does not disable renewal for the rest of the show ([0161](0161-spotify-device-readiness-on-demand.md)).
- Transfer-with-play can resume whatever context Spotify still has (including a just-ended URI). That is preferable to staying silent; the DJ can skip.

## See also

- [0078](0078-spotify-web-playback-sdk-device.md)
- [0112](0112-observed-transport-state.md)
- [0161](0161-spotify-device-readiness-on-demand.md) — renews the lease *before* the play instead of only after it fails
- `apps/bridge-daemon/static/spotify.html`
- `apps/bridge-daemon/src/spotifyDevice.ts`
