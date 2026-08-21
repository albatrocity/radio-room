# 0109. local-remote: Loopback sidechain ducking engine

**Date:** 2026-08-21
**Status:** Accepted

## Context

On the DJ Mac, music is ducked when microphones are open by running Ableton Live solely as a sidechain compressor on a Loopback virtual device named **Ducking** (sidechain in 1/2, programme in 3/4, ducked out 5/6). Audio Hijack feeds that device and returns the mix via Orion/Neve; Ableton is not in the AH session. Ableton is overkill for this role (CPU, RAM, UI). An Audio Unit hosted in Audio Hijack cannot replace it: AH does not support AU sidechain/aux inputs.

## Decision

Add a **`features.ducking`** module to **`apps/local-remote`**:

1. A **dedicated Core Audio realtime thread** (not Tokio) opens the Loopback **Ducking** device as input and output, runs a feed-forward soft-knee sidechain compressor, and writes ducked programme to the configured output pair.
2. Defaults match the existing Ableton Compressor2 preset (threshold ≈ −31.5 dB, near-infinite ratio, ~2.9 ms attack, ~1714 ms release, 6 dB knee, ~80 Hz sidechain HPF).
3. Operators configure device name, channel map, and compressor params in the **`:9876`** UI; state persists in `local-remote/config.json`.
4. No Audio Hijack or Loopback session rewriting in v1 — quit Ableton and enable ducking in local-remote as a drop-in on the same device.

Rejected for v1: shipping an AU/VST; hosting ducking inside bridge-daemon; driving duck from Redis/`SYSTEM:*`.

## Consequences

- **Positive:** Removes Ableton from the show path; tiny native DSP next to the existing DJ Mac supervisor; same Loopback graph AH already uses.
- **Positive:** Config and meters live with the rest of the DJ Mac control plane ([ADR 0025](0025-local-remote-rust-daemon.md), [ADR 0084](0084-dj-mac-single-zip-supervised-bridge.md)).
- **Negative:** Introduces Core Audio / `cpal` dependency and macOS-only realtime constraints (no alloc in the audio callback; careful channel mapping on Loopback).
- **Negative:** Channel index 0- vs 1-based quirks between Ableton, AH, and Core Audio must be validated with meters on the DJ Mac hardware.
