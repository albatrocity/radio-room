# 0207. Local Dev Radio Station (Fake Shoutcast / ICY)

**Date:** 2026-10-09
**Status:** Accepted

## Context

Local radio-room testing normally depends on a real Shoutcast encoder (e.g. Audio Hijack broadcasting to a station URL). That blocks offline development and makes Media Bridge radio rooms harder to exercise: bridge link/control uses Redis, but room Now Playing for `type: "radio"` still comes from the Shoutcast/ICY poller ([ADR 0037](0037-hybrid-radio-shoutcast-rtmp-bridge.md), [ADR 0077](0077-bridge-composite-playback-controller.md)).

We need a **dev-only** fake station that:

1. Serves listenable MP3 audio to the browser.
2. Exposes ICY metadata that `@repo/media-source-shoutcast` can poll via `radioProtocol: "raw"`.
3. Can mirror Media Bridge now-playing (`SYSTEM:NOW_PLAYING_CHANGED`) into that ICY metadata without claiming to capture host audio.

## Decision

1. **Optional Compose service** — `dev-radio` behind profile `dev-radio` (`apps/dev-radio-station`), same idiom as MediaMTX (`live`) and load-tester (`testing`). Not registered as a production media adapter.

2. **Protocol** — Primary path is **`raw` ICY** on a single stream URL (`/stream`). Title format is `Title | Artist | Album` to match the shoutcast adapter parser.

3. **Synthetic audio** — Loop a small committed MP3 fixture. Audio is *not* the Media Bridge programme mix; host capture (Audio Hijack / Loopback) remains required for real broadcast audio.

4. **Bridge metadata mirroring** — The service subscribes to Redis `SYSTEM:NOW_PLAYING_CHANGED` (same channel the bridge daemon publishes). Optional `ROOM_ID` filters events; default follows the latest event (normal one-daemon local setup). Until a bridge event arrives, rotate deterministic fallback tracks.

5. **Docker URL split** — API metadata poll uses Docker DNS (`http://dev-radio:8010/stream`); browser listen URL uses the published host port (`http://127.0.0.1:8010/stream`). Documented and opt-in via `VITE_DEV_RADIO_*` create-room prefill; public rcast defaults remain when unset.

6. **CORS** — Permissive `Access-Control-Allow-Origin: *` for local MSE / analysis tooling ([ADR 0141](0141-radio-mse-transport-and-oscilloscope.md)).

## Consequences

### Positive

- Radio rooms can be tested without Audio Hijack for **metadata and listen-URL plumbing**.
- Media Bridge link/RPC testing can pair with ICY titles that match bridge now-playing for queue / `handleRoomNowPlayingData` dedup paths.
- No production adapter or room-type changes.

### Negative / trade-offs

- Listeners hear synthetic audio, not Chrome/mpv. End-to-end “what the DJ Mac sounds like” still needs host capture into a real encoder.
- `raw` differs from the UI default `shoutcastv2`; create-room prefill sets protocol when env is present.
- After admin URL edits, poll jobs may still use `mediaSourceConfig.url` from create time until restart/restore (existing shoutcast quirk; set URLs at create for local fakes).

## See also

- [docs/RADIO_LOCAL_TESTING.md](../RADIO_LOCAL_TESTING.md)
- [docs/BRIDGE_LOCAL_TESTING.md](../BRIDGE_LOCAL_TESTING.md)
- [0037](0037-hybrid-radio-shoutcast-rtmp-bridge.md), [0077](0077-bridge-composite-playback-controller.md), [0082](0082-media-bridge-link-via-redis-pubsub.md)
