# 0036. Stream Health Webhook for Live Rooms

**Status:** Accepted

## Context

Stream liveness for live rooms was driven entirely by `local-remote`'s macOS Now Playing watcher (`SYSTEM:NOW_PLAYING_CHANGED` via Redis pub/sub → `adapter-rtmp`). If the DJ streams audio that is not from a recognized music app — vinyl, talking, non-standard apps — no Now Playing event fires, and the room shows "offline" even though audio is actively flowing through MediaMTX.

We needed a mechanism that detects whether audio is actually being ingested by MediaMTX, independent of track metadata from music apps.

Three approaches were considered:

1. **Poll MediaMTX API** from the API server — adds latency, requires periodic polling, and couples the server to MediaMTX's API schema.
2. **Redis PUBLISH from MediaMTX** — `curl` would publish directly to Redis. However, the Heroku `REDIS_URL` rotates on upgrades/rollovers, making it unreliable as a stable endpoint.
3. **HTTP webhook from MediaMTX to the API server** — MediaMTX calls the API server's stable domain via `curl` on stream ready/not-ready events. The API domain does not rotate.

## Decision

Use **HTTP webhooks** from MediaMTX to the API server for stream health reporting. Two independent signals now combine to describe a live room's state:

- **Stream health** (new): MediaMTX `runOnReady`/`runOnNotReady` hooks `curl` a `POST /api/stream-health` endpoint on the API server. This is the sole authority for online/offline status in live rooms.
- **Now Playing** (existing): `local-remote` → Redis pub/sub → `adapter-rtmp` → `handleRoomNowPlayingData`. For live rooms, this now only updates displayed track metadata without changing the room's online/offline status.

Authentication uses a **shared secret** (`STREAM_HEALTH_SECRET`): MediaMTX sends it as a Bearer token; the API server validates it. The secret is stored as a GitHub Actions secret (passed to the container via `-e`) and as a Heroku config var.

The `handleRoomNowPlayingData` operation was modified so that for `room.type === "live"`, it no longer emits `MEDIA_SOURCE_STATUS_CHANGED`. That event is now exclusively emitted by the new `handleStreamHealth` operation for live rooms.

## Consequences

- **Positive:** Live rooms show as "online" as soon as audio reaches MediaMTX, regardless of whether a music app is active. DJs can stream vinyl, microphone audio, or any source without the room appearing offline.
- **Positive:** The API server domain is stable, avoiding Heroku Redis URL rotation issues.
- **Positive:** No new dependencies — `curl` is already available in the MediaMTX Docker image.
- **Positive:** Clear separation of concerns: stream liveness vs. track metadata.
- **Negative:** Two secrets must be kept in sync (GitHub Actions environment + Heroku config vars).
- **Negative:** If the API server is unreachable when MediaMTX fires the hook, the status update is lost (no retry built into `runOnReady`). In practice, stream restarts re-trigger the hook.
- **Note:** Radio rooms (`type: "radio"`) are unaffected; they continue to derive status from `handleRoomNowPlayingData` as before.
