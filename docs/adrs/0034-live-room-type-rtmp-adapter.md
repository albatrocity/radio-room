# 0034. Live Room Type and RTMP Adapter

**Date:** 2026-04-07
**Status:** Accepted

## Context

The platform currently supports two room types: `jukebox` (Spotify-controlled playback) and `radio` (Shoutcast/Icecast stream with metadata embedded in ICY headers). The Shoutcast approach is cost-effective for audio-only broadcasting, but has limitations: 5-15 second latency, no adaptive bitrate, and tight coupling between audio delivery and metadata (both travel in the ICY stream).

A new broadcasting workflow using Audio Hijack's Live Stream block sends RTMP to an ingest server, which then delivers to listeners via WebRTC (sub-second latency) or LL-HLS (2-6s fallback). This requires separating audio delivery from metadata delivery, since RTMP does not embed structured track metadata the way Shoutcast does.

## Decision

### New room type: `live`

Add `"live"` to the `Room.type` union alongside `"jukebox"` and `"radio"`. The `radio` type continues to mean "Shoutcast/Icecast station with ICY metadata." The `live` type means "RTMP ingest with sidecar metadata via Redis pub/sub."

### RTMP MediaSource adapter

Create `packages/adapter-rtmp/` implementing `MediaSourceAdapter`. Unlike `adapter-shoutcast` which polls a station URL on a cron job, the RTMP adapter subscribes to the `SYSTEM:NOW_PLAYING_CHANGED` Redis pub/sub channel and calls `submitMediaData()` on each message. The metadata pipeline (`handleRoomNowPlayingData` → `resolveTrackData` → MetadataSource enrichment) is shared with Shoutcast.

### MediaMTX for RTMP ingest and delivery

Use MediaMTX (MIT, single Go binary) as the RTMP ingest server. It automatically converts RTMP to WebRTC (WHEP) and LL-HLS simultaneously. WebRTC is the primary playback protocol (sub-second latency); LL-HLS is the automatic fallback for restrictive networks.

### Metadata sidecar via `local-remote` daemon

The `local-remote` Rust daemon (which already bridges local broadcaster state to the platform via Redis) gains a Now Playing watcher feature using the `media-remote` crate. On track change it publishes `SYSTEM:NOW_PLAYING_CHANGED` to Redis and writes a `Now Playing.txt` file for Audio Hijack's stream overlay.

### Descriptive helper functions for room type checks

Replace direct `room.type === "radio"` checks with semantic helpers:

- **`hasListenableStream(room)`**: Returns true for `radio` and `live` rooms (rooms that provide an audio stream for the browser to play).
- **`isStreamingMode(room)`**: Updated to use `hasListenableStream()` instead of checking `=== "radio"` directly.

Room-type-specific checks (adapter `onRoomCreated` guards, `configureAdaptersForRoomType` branches, per-type settings forms) remain as direct comparisons since they are intentionally coupled to a single room type.

### Streaming mode generalization

`enterStreamingMode()` and `refreshNowPlayingFromCachedMeta()` (renamed from `refreshNowPlayingFromStationMeta`) derive `mediaSource.type` and `sourceType` from `room.mediaSourceId` instead of hardcoding `"shoutcast"`.

## Consequences

- A new `"live"` room type is available alongside `"jukebox"` and `"radio"`.
- The adapter pattern (ADR 0005) is extended with a third MediaSource adapter; no changes to `@repo/server` core are needed beyond the room type union and helper functions.
- Track metadata for live rooms flows through a separate channel (Redis pub/sub) rather than being embedded in the audio stream, decoupling audio delivery from metadata delivery.
- The frontend gains a `LivePlayer` component using WebRTC (via `mediamtx-webrtc-react`) with LL-HLS fallback (via `hls.js`), while `radio` rooms continue using Howler.js for HTTP streams.
- MediaMTX infrastructure is added to Docker Compose (under a `live` profile) and deployed to a VPS via GitHub Actions.
- The `local-remote` daemon gains broader utility as the single coordination point for track metadata on the broadcaster's machine.
- Approximately 25 call sites across backend and frontend need updating to use `hasListenableStream()` or to add `"live"` branches.
