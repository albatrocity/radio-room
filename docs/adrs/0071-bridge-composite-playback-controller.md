# 0071. Bridge Composite Playback Controller and Mac Daemon

**Date:** 2026-07-20
**Status:** Partially superseded by [0072](0072-spotify-web-playback-sdk-device.md) (Spotify Connect device: Spotify.app → optional Web Playback SDK in bridge Chrome)

## Context

Stream-backed rooms (radio/Shoutcast, live/RTMP) currently use Spotify as the sole app-controlled playback controller while Audio Hijack captures Spotify.app for broadcast. Operators want to queue and play tracks from Spotify, Tidal, YouTube, and a local library in one room without changing the platform's adapter, queue, or plugin model.

An Electron *playback* runtime was rejected: Spotify Web Playback SDK is fragile under DRM in Electron, and Tidal would require a Widevine-capable Electron fork. A composite server-side controller plus a headless Mac daemon that drives real Chrome (CDP) and mpv is a better fit.

Existing ADRs that constrain this work: [0005](0005-adapter-pattern-for-media-services.md) (adapter registration), [0013](0013-track-identity-media-and-metadata-sources.md) (media vs metadata identity), [0040](0040-app-controlled-playback-and-ordered-queue.md) / [0064](0064-radio-app-controlled-playback-default.md) (app-controlled Redis queue), [0025](0025-local-remote-rust-daemon.md) (local Redis-connected daemon precedent; Phase 4 may absorb its duties), [0069](0069-playback-controller-volume-and-before-play-hook.md) (volume + beforePlay hook).

## Decision

1. **Opt-in composite controller** — New package `@repo/adapter-bridge` registers a `PlaybackController` named `"bridge"`. Rooms opt in via `playbackControllerId: "bridge"` (radio/live only). Media source remains `shoutcast` or `rtmp`. Bridge rooms must use `playbackMode: "app-controlled"`.

2. **Routing by `mediaSource.type`** — `playTrack` / pause / seek / volume route by the track's media source:
   - `spotify` → existing Spotify PlaybackController (Spotify Connect). Device target is Spotify.app by default; when the daemon opts in, prefer the Web Playback SDK device in bridge Chrome ([0072](0072-spotify-web-playback-sdk-device.md)).
   - `tidal` | `youtube` | `local` → Redis RPC to a Mac daemon

3. **Mac daemon (`apps/bridge-daemon`)** — Headless Node process on the DJ Mac. Drives dedicated Chrome via CDP (YouTube IFrame host page; Tidal via CDP on the spike-chosen host), local files via Navidrome search + mpv JSON IPC. Publishes `SYSTEM:NOW_PLAYING_CHANGED` and writes Audio Hijack Now Playing.txt. Explicit connect/disconnect with Redis presence heartbeat. One room at a time, switchable at runtime.

4. **Redis RPC protocol** — Room-scoped channels `BRIDGE:{roomId}:REQUEST` / `:RESPONSE` / `:EVENT` with correlation IDs and timeouts. Presence key `bridge:{roomId}:presence` with TTL. Schemas live in `adapter-bridge` and are shared with the daemon.

5. **Enum widening** — `mediaSourceTypeSchema` gains `"tidal" | "youtube" | "local"`; `metadataSourceTypeSchema` gains `"youtube" | "local"`. Queue stamping uses the search result's source (no hard-coded Spotify).

6. **Advance loop** — Bridge registers `bridge-player-{roomId}`: primary advance on daemon `ENDED` events; 1s probe fallback. When active source is Spotify, state reads may delegate to the Spotify controller.

7. **Volume** — Per-driver `setVolume` with apply-on-`playTrack` for v1 ([0069](0069-playback-controller-volume-and-before-play-hook.md)). Audio Hijack Volume-block scripting remains a future optional upgrade.

8. **Packaging** — Phases 1–3: monorepo CLI daemon. Electron supervisor shell (Phase 4) is deferred. Localhost control UI + Redis room discovery shipped as [0073](0073-bridge-daemon-local-control-ui.md).

9. **Tidal host** — Tidal **desktop app** launched with `--remote-debugging-port` (CDP), not a Chrome tab, provided it exposes the same playback control surface.

10. **Search** — Fan-out across room metadata sources; configurable `mediaSourcePriority` collapses overlapping Spotify/Tidal results. YouTube search is server-side (Data API v3). Local search is daemon RPC-backed.

## Consequences

### Positive

- Fits existing adapter/queue/plugin surfaces; plugins keep using `mediaSource.trackId` and `PluginAPI.skipTrack`.
- DRM stays in real Chrome / Spotify.app / Tidal's own stack.
- Opt-in per room; non-bridge rooms unchanged.

### Negative / trade-offs

- New operational surface: DJ Mac must run the daemon (and Chrome/mpv/Navidrome).
- Tidal CDP drivers are fragile; Spotify-first search dedup reduces exposure.
- Until Phase 4 absorbs `local-remote`, operators must disable local-remote Now Playing for bridge rooms to avoid double-publishing.
- Audio Hijack volume scripting is undocumented; may fall back to per-driver volume.

## See also

- Design plan: `.cursor/plans/macos_media_bridge_design_4c129163.plan.md`
- [0005](0005-adapter-pattern-for-media-services.md), [0013](0013-track-identity-media-and-metadata-sources.md), [0025](0025-local-remote-rust-daemon.md), [0040](0040-app-controlled-playback-and-ordered-queue.md), [0069](0069-playback-controller-volume-and-before-play-hook.md)
