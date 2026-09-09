# 0167. Shared radio analysis tap (refcount + seismograph)

**Date:** 2026-09-09
**Status:** Partially superseded by [0168](0168-beat-detector-now-playing-info.md)
**Amends:** [0141](0141-radio-mse-transport-and-oscilloscope.md) §3 (tap started only for Oscilloscope)

## Context

[ADR 0141](0141-radio-mse-transport-and-oscilloscope.md) feeds an MSE-aligned PCM ring via
`MPEGDecoderWebWorker` so the Oscilloscope can draw without a second Icecast connection.
`startAnalysisTap` / `stopAnalysisTap` are a boolean: one owner mounts the tap, unmount frees it.

A second inventory visual — **Seismograph** (`item-shops:seismograph`) — needs the same decode
path for a slow energy envelope and a BPM estimate. Both SKUs may be held at once. Starting a
second decoder would double WASM/CPU cost; stopping when either unmounts would kill the other’s
trace.

## Decision

1. **Refcounted tap.** Consumers call `acquireAnalysisTap()` / `releaseAnalysisTap()`. The worker
   and rings start on the first acquire and free only when the refcount reaches zero.
2. **Envelope hops on decode.** After mono mix, `decodeBatch` also writes RMS (and optional onset)
   hops into an ~8 s envelope ring (hop 512 samples). PCM ring for the Oscilloscope is unchanged.
3. **BPM is client-only.** Pure functions over the envelope (60–180 BPM, confidence gate). No
   server round-trip, no chat announce.
4. **Seismograph SKU** mirrors Oscilloscope hold rules: rare, 50 coins, radio-only shop offer,
   inert catalog (no `use`), lazy React in `apps/web`. Layout is a bottom Now Playing tape + BPM
   readout, not a second CRT.
5. **60 s MPEG backfill** remains Oscilloscope-only (`backfillRadioMseAnalysisTap`). Seismograph
   fills from live decode; dual-wield still backfills when the scope mounts.
6. **No audible DSP.** Analysis stays visual/game-input only (iOS lock-screen constraint from
   [ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md)).

## Consequences

- Dual-wield pays one decoder + two canvases, not two decoders.
- Listeners owning neither item still incur no worker (refcount stays 0).
- Follow-on visuals (spectrum, VU) should share the same acquire/release contract.
- Envelope storage is kilobytes; no slim “envelope-only” decode mode in v1.

**Supersession note:** The Seismograph SKU and tape layout (§§3–5 consumer side) are replaced by
the Beat Detector in [0168](0168-beat-detector-now-playing-info.md). Refcounted tap + envelope
hops (§§1–2, 6) remain in force.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0141](0141-radio-mse-transport-and-oscilloscope.md) — MSE transport and Oscilloscope
- [ADR 0168](0168-beat-detector-now-playing-info.md) — Beat Detector in `nowPlayingInfo`
- [ADR 0169](0169-vu-meter-now-playing-overlay.md) — VU Meter envelope consumer on artwork
- [`apps/web/src/lib/mse/analysisTap.ts`](../../apps/web/src/lib/mse/analysisTap.ts)
