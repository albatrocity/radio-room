# 0072. Spotify Web Playback SDK Device in Bridge Chrome

**Date:** 2026-07-20
**Status:** Accepted

## Context

Bridge rooms ([0071](0071-bridge-composite-playback-controller.md)) drive Spotify via the Spotify Web API against whatever Connect device is active — typically Spotify.app on the DJ Mac. That Connect session times out when idle, producing unrecoverable "No active device found" / can't-resume errors. Only a human clicking play in Spotify.app revives the session.

Audio Hijack also needs a separate capture tile for Spotify.app alongside Chrome (YouTube) and optionally TIDAL/mpv.

Hosting a Spotify **Web Playback SDK** player in the daemon's existing Chrome profile creates a Connect device whose lifecycle we own. Playback **control** stays on the server-side Web API; the SDK page is a passive audio device.

## Decision

1. **Opt-in SDK device** — Daemon config `services` may include `"spotify"`. When connected, the daemon loads `spotify.html` (Web Playback SDK) via the shared `StaticHost`, writes `bridge:{roomId}:spotify_device` on SDK `ready`, and clears it on disconnect. This is **not** a Driver and is **not** listed in `CAPABILITIES`.

2. **Token provisioning** — Daemon `getOAuthToken` reads `bridge:{roomId}:spotify_token`. If missing, it publishes `TOKEN_REQUEST` (`service: "spotify"`) on `BRIDGE:{roomId}:EVENT`. The API (`adapter-bridge`) refreshes the room creator's Spotify token and SETs the key with ~50 min TTL. OAuth scope gains `streaming` (room creator must re-link).

3. **Device targeting with fallback** — `adapter-spotify` `makeApi` uses optional `getPreferredDeviceId`. When a preferred id is advertised, resolve the target from `getAvailableDevices` by **id first, then Connect name** (`Listening Room Bridge` — the SDK `ready` device_id often differs from the listed id). Transfer to the resolved id, then use it for play/pause/etc. If still unlisted, attempt transfer by the ready id; on 404 / failure → fall back to legacy `getNowPlayingDevice`. The daemon reconciles Redis to the listed id after `ready`, and calls `activateElement` (+ a synthetic click) so browser autoplay policy does not block Connect activation. Non-bridge rooms and daemons without `"spotify"` behave exactly as before.

4. **Quality** — SDK output is typically ~256kbps AAC (vs ~320kbps Ogg on desktop). Acceptable for a transcoded Shoutcast/RTMP broadcast chain.

5. **Ejection** — Feature is additive: remove daemon files + token provisioner + preferred-device helper; leave `streaming` scope and `StaticHost` lift.

## Consequences

### Positive

- Resume/play no longer depends on Spotify.app staying awake.
- Audio Hijack can capture Chrome alone for Spotify + YouTube (mpv still separate for local).
- Opt-in per daemon; safe fallback preserves Spotify.app path.

### Negative / trade-offs

- Requires Premium + `streaming` scope re-consent.
- Slightly lower Spotify audio bitrate into the capture chain.
- Chrome background throttling may idle the SDK; watchdog reloads the host page.

## See also

- [0071](0071-bridge-composite-playback-controller.md)
- [docs/BRIDGE_LOCAL_TESTING.md](../BRIDGE_LOCAL_TESTING.md)
