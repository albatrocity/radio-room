# 0037. Hybrid Radio — Shoutcast + Optional Experimental WebRTC

**Date:** 2026-04-09
**Status:** Accepted

## Context

Rooms need a **bridge** to try RTMP/MediaMTX WebRTC at scale while keeping Shoutcast as the reliable default. Shows are simulcast to both; most listeners stay on Shoutcast, with WebRTC offered as an opt-in, admin-gated **experimental** path.

## Decision

1. **Room model**: Extend `type: "radio"` with `liveIngestEnabled`, `liveWhepUrl`, and `liveHlsUrl`. Pure `live` rooms (ADR 0034) remain unchanged.
2. **Canonical Now Playing**: Only the Shoutcast/ICY pipeline updates `room:current` and global `TRACK_CHANGED`. RTMP Redis sidecar submissions are **ignored** for hybrid radio (`handleRoomNowPlayingData` guard).
3. **Stream health**: MediaMTX webhook updates a **separate** Redis key for hybrid WebRTC (`streamHealth:webrtc`). Hybrid **does not** call `clearRoomCurrent` when WebRTC goes offline. `STREAM_HEALTH_CHANGED` and `MEDIA_SOURCE_STATUS_CHANGED` may carry `ingest: "webrtc_experimental"` and `streamTransport: "webrtc"` respectively.
4. **Clients**: Default listen transport is Shoutcast; **unmount and switch** to `LivePlayer` only when the user chooses WebRTC. UI labels the WebRTC path experimental and notes metadata lag vs audio.
5. **Analytics**: `START_LISTENING` / `SET_LISTENING_AUDIO_TRANSPORT` report `audioTransport` (`shoutcast` | `webrtc`); Redis counters support **room export** snapshot fields.

## Consequences

- Single metadata pipeline; no fork for reactions, playlist, or plugins.
- Stream health matching supports hybrid rooms by WHEP URL path (`packages/server/controllers/streamHealthController.ts`).
- ADR 0034 remains the reference for RTMP-only `live` rooms; this ADR covers **radio + optional** WebRTC only.
