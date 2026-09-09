# 0168. Beat Detector in Now Playing info

**Date:** 2026-09-09
**Status:** Accepted
**Amends:** [0167](0167-shared-radio-analysis-tap.md) (Seismograph SKU / tape layout)
**Partially supersedes:** [0167](0167-shared-radio-analysis-tap.md) §§3–5 (BPM consumer + second visual SKU)

## Context

[ADR 0167](0167-shared-radio-analysis-tap.md) introduced a refcounted MSE analysis tap and a
**Seismograph** inventory visual (rolling energy tape + BPM) sharing that tap with the
Oscilloscope. In practice the tape was a poor fit for Now Playing layout, and the Oscilloscope
already covers waveform visualization. A second SKU should be a compact **beat / tempo gadget**,
not another full-panel canvas.

The Seismograph SKU (`item-shops:seismograph`) never shipped; it is deleted rather than migrated.

## Decision

1. **Beat Detector SKU** — `item-shops:beat-detector`, inert catalog (no `use`), rare, 50 coins,
   `availableInRoomTypes: ["radio"]`, sold at **Spy World**. Icon `Radar`.
2. **Mount in `nowPlayingInfo`** — Lazy React in `apps/web`
   (`BeatDetector.tsx`) inside the existing Now Playing metadata column (sibling above
   `<PluginArea area="nowPlayingInfo" />`), gated by inventory ownership. Not a plugin
   `componentSchema` type.
3. **UI** — Monospace BPM (or `—`) plus a small `primary` pulse indicator on detected beats.
   Reduce-motion caps pulse rate ([ADR 0136](0136-inventory-owned-client-visuals.md)).
4. **Shared tap unchanged** — Still `acquireAnalysisTap` / `releaseAnalysisTap` + envelope hops
   from [0167](0167-shared-radio-analysis-tap.md). Dual-wield with Oscilloscope remains one worker.
   Beat Detector does **not** call MPEG backfill.
5. **Client-only BPM + onset** — Derived from MSE analysis-tap PCM (or related client-side
   analysis). No server round-trip, no chat announce, no audible DSP. Do not route the radio
   `<audio>` element through `MediaElementAudioSourceNode` / `AudioContext.destination`
   ([ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) /
   [0141](0141-radio-mse-transport-and-oscilloscope.md)). Concrete tempo algorithms may change
   while evaluating libraries.
6. **MSE unsupported** — Owner still sees the row with `—` and no pulse; tap is not started.

## Consequences

- Spy World gains a radio-only gadget SKU; Sweetwater keeps Oscilloscope only.
- Orphan `item-shops:seismograph` stacks (if any local/dev) are inert with no conversion path.
- Follow-on inventory visuals that need analysis still share the same acquire/release contract.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0141](0141-radio-mse-transport-and-oscilloscope.md) — MSE transport and Oscilloscope
- [ADR 0167](0167-shared-radio-analysis-tap.md) — shared analysis tap (refcount + envelope)
- [`apps/web/src/components/NowPlaying/BeatDetector.tsx`](../../apps/web/src/components/NowPlaying/BeatDetector.tsx)
