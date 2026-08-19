# 0103. Physical Media Track Previews

**Date:** 2026-08-19
**Status:** Accepted

## Context

Listeners need to hear ~15-second mid-track clips of Physical Media / Local library tracks in the browser before buying (Record Store) or queueing (CatalogBrowse, TrackSearch). Navidrome is LAN-only; the DJ Mac Media Bridge must produce clip bytes. Previews must not play out of the bridge stream, must not grant Local search/queue access, and must not leak Navidrome playlist ids beyond ADR 0099 (`mediaKey` / `shortId` only).

## Decision

1. **Transport:** Bridge daemon RPC `getTrackPreview` returns clip bytes once; the API caches them in Redis and serves an HTTP URL. No PUBSUB “ready” event — the Socket.IO request is the spinner (same pattern as cover art, ADR 0099 §8).
2. **Clip source:** ffmpeg from the file on disk via `musicFolder` + song path. ffmpeg on PATH and `navidrome.musicFolder` are required for previews (playback via mpv/stream.view does not need musicFolder).
3. **Authz:** Preview iff the caller holds the item **or** its `shortId` is on their **current** shopping-instance offers. Store preview does not require Local `metadataSourceAccess` search grant. CatalogBrowse Local album drill-in uses grant-scoped playlist membership instead.
4. **Clip URL:** Public GET with unguessable `previewId` (like room images). Generation is socket-authorized.
5. **Client ducking:** `previewDucked` on `audioActor` mutes the radio/live element without flipping the mute control or Volume Manager. Clip plays even when the listener is muted, at stored volume (or 0.7 if volume is 0). HTML5 Howl for the clip.

## Consequences

- DJ Mac pack must include a daemon that implements `getTrackPreview`; stale packs surface as bridge-unreachable.
- Hosts must install ffmpeg and set `musicFolder` for previews to work.
- First-play latency includes disk read + ffmpeg + Redis + HTTP; 20s RPC timeout matches playlist listing.
- Public GET of unguessable ids follows the same trust model as room images.
- Titles/durations on unpurchased Record Store offers become visible before purchase (intended).
