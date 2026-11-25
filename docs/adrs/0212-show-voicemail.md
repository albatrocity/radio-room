# 0212. Show voicemail

**Date:** 2026-11-20
**Status:** Accepted

## Context

Callers leave voicemail for Listening Room shows today through a paid phone service. That cost sits outside the product, and a phone number works against the anonymity theme of the platform. The homepage already has an off-air branch that links to that number. During a show, the admin needs a vetted inbox of recent messages and a way to play them on the DJ Mac (sidechain-ducked over the bed) or, when the bridge is down, on the admin's own computer.

Private music uploads ([0119](0119-private-music-uploads-presign.md)) are the closest transport pattern (presigned S3 PUT), but they require a room login, write the username into the key, and never play back in-app. Bridge `playTrack` only accepts Spotify / Tidal / YouTube / local ids ([0077](0077-bridge-composite-playback-controller.md)); an arbitrary HTTPS file has no channel. Burner Phone TTS already targets a dedicated CoreAudio device so Audio Hijack can duck the bed ([0178](0178-media-bridge-tts-say-output.md), [0109](0109-local-remote-loopback-sidechain-ducking.md)). Segments have no kind enum today ([0017](0017-scheduling-app-for-show-programming.md)); activation only patches room settings and plugins ([0021](0021-room-attached-show-and-segment-activation.md), [0026](0026-segment-room-settings-overrides.md)).

## Decision

1. **Anonymous homepage recorder** — While no public lobby room is listed, the offline homepage offers a browser recorder (max 2:00). The mic passes through an 8 kHz G.711 μ-law telephone band in the browser before `MediaRecorder`, so the stored object already sounds like a phone. The caller reviews (play / re-record) before Send. Upload is a public presigned PUT under `voicemails/v1/{id}.{ext}` (not on CloudFront). Complete runs `HeadObject` then inserts a Postgres row with no uploader identity. Lightweight IP rate limits use HMAC-SHA256 counters in Redis.

2. **Segment role** — `segment.role` is `standard` | `voicemail` (default `standard`). Activation copies `activeSegmentRole` onto the Redis room beside `activeSegmentId`. Only a voicemail role opens the admin inbox in that room.

3. **Admin inbox** — Room-admin socket events list / play / pause / seek / hide. List takes `{ from, to }` (cap 200, max span 45 days, `from` within 120-day retention) and returns presigned GETs. Hide sets `status: hidden`. Nothing auto-airs.

4. **Bridge URL sidechain** — New `playUrl` RPC with `{ url, mode, duck }`. Two daemon mpv processes (not in the Router driver map): ducked on `tts.audioDevice`, dry on the default output. Transport reuses `pause` / `play` / `seekTo` / `getPlayback` with `source: "url"` for the ducked player only. Neither player publishes `STATE` / `ENDED`, so they cannot advance the queue. Voicemail always uses `duck: true` and `mode: "replace"`. `enqueue` and `duck: false` ship for a future `context.playback` host method; this ADR does not add a plugin API.

5. **Infra** — S3 lifecycle expires `voicemails/` after 120 days. The API IAM user gains `s3:GetObject` on `voicemails/*` so HeadObject and presigned GET work. CloudFront still cannot read that prefix.

## Consequences

- Quicktalk / `VITE_VOICEMAIL_NUMBER` leave the product UI.
- Old DJ Mac packs fall back to admin-machine `<audio>` until a pack ships that understands `playUrl`.
- Telephone sound is approximate (8 kHz μ-law); AMR-NB is intentionally not used.
- One sidechain URL channel is shared with future plugin callers; `replace` clears only the selected player's queue.

## See also

- [0017](0017-scheduling-app-for-show-programming.md), [0021](0021-room-attached-show-and-segment-activation.md), [0026](0026-segment-room-settings-overrides.md)
- [0077](0077-bridge-composite-playback-controller.md), [0109](0109-local-remote-loopback-sidechain-ducking.md), [0119](0119-private-music-uploads-presign.md), [0178](0178-media-bridge-tts-say-output.md)
- [0204](0204-device-trust-boundary.md)
