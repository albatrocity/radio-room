# 0069. Playback Controller Volume and beforePlayQueuedTrack Hook

**Date:** 2026-07-07
**Status:** Accepted

## Context

Segment scheduling needs per-segment Spotify volume control (e.g. music at 100%, talk at 40%). Volume must be set on the room creator's active Spotify Connect device via the server-side `PlaybackController`, not in the browser. Plugins need a safe API to adjust volume, and app-controlled playback needs a hook to run plugin logic immediately before `playTrack(uri)` (e.g. reset volume at track start).

The Volume Manager plugin (`@repo/plugin-volume-manager`) is the first consumer. It exposes two independent knobs:

- **`volume` (live)** — applied immediately when changed (slider, config save, segment preset).
- **`startVolume` + `setOnTrackStart`** — applied only when a new track begins; changing `startVolume` does not affect the current track.

## Decision

### 1. Optional `PlaybackControllerApi.setVolume`

Add optional `setVolume?(volumePercent: number): Promise<void>` to `PlaybackControllerApi`. Spotify adapter implements it via `api.player.setPlaybackVolume(percent, deviceId)` with 0–100 clamping. Controllers without volume support omit the method.

### 2. PluginAPI pass-through

Add to `PluginAPI`:

- `setPlaybackVolume(roomId, volumePercent)` — resolves room `PlaybackController`, calls `setVolume` when present, returns `{ success, message? }`.
- `supportsVolumeControl(roomId)` — `true` when `api.setVolume` exists.

### 3. `beforePlayQueuedTrack` awaited plugin hook

Add optional `beforePlayQueuedTrack?(params)` on `Plugin`. `PluginRegistry.runBeforePlayQueuedTrack` invokes all implementing plugins sequentially with fail-open timeout (same semantics as `validateQueueRequest`).

Invoke immediately before `playTrack(uri)` in app-controlled paths:

- `DJService.playQueuedTrack` (`reason: "manual"`)
- `trackAdvanceJob` (`reason: "auto-advance"`)
- `PluginAPI.skipTrack` (`reason: "plugin-skip"`)

Spotify-controlled rooms rely on `TRACK_CHANGED` for track-start side effects (polling latency accepted).

### 4. Declarative `slider` plugin component

Add `slider` to `TemplateComponentName`. Props: `dataKey`, `min`, `max`, `step`, `label?`, `icon?`, `action`, `paramKey?` (defaults to `dataKey`), `adminOnly?`. `icon` (a `LucideIconName`) renders in place of `label` when present. On commit, emits `EXECUTE_PLUGIN_ACTION` with `params` (e.g. `{ volume: 55 }`). Server `executeAction` remains authoritative. Slider interaction is managed by `createSliderMachine` (`apps/web/src/machines/sliderMachine.ts`) which handles optimistic updates during the async server round-trip: `idle` → `dragging` → `pendingConfirmation` → (external matches or timeout) → `idle`.

### 5. Volume Manager plugin

`@repo/plugin-volume-manager`: config `enabled`, `volume`, `setOnTrackStart`, `startVolume`; admin-only slider in `nowPlayingInfo` area; `beforePlayQueuedTrack` + `TRACK_CHANGED` apply `startVolume`; `onConfigChange` applies live `volume` only; `executeAction("setVolume")` for slider.

## Consequences

### Positive

- Volume control is centralized on the PlaybackController; plugins do not touch Spotify SDK directly.
- App-controlled track starts can run plugin side effects before audio begins.
- Two-knob model supports segment ducking and per-track reset ("ride the fader") without conflating immediate vs track-start behavior.
- `slider` component is reusable by future plugins.

### Negative / trade-offs

- Volume affects the creator's Spotify device globally for that session, not per-listener browser audio.
- Spotify-controlled track-start uses `TRACK_CHANGED` (~5s polling), not the awaited hook.
- `beforePlayQueuedTrack` adds latency to play paths (bounded by 500ms fail-open timeout per plugin).
- No smooth volume fades; changes jump instantly.
