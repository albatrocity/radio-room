# 0171. Chromatic Tuner in Now Playing info

**Date:** 2026-09-14
**Status:** Partially superseded by [0175](0175-item-shop-themes-and-assignment-rarity.md) (Beat Detector shop placement in Consequences only)
**Amends:** [0167](0167-shared-radio-analysis-tap.md) (PCM consumer)

## Context

Radio inventory visuals already share one MSE analysis tap ([ADR 0167](0167-shared-radio-analysis-tap.md)):
Oscilloscope (waveform), Beat Detector (BPM, [ADR 0168](0168-beat-detector-now-playing-info.md)), and
VU Meter (level, [ADR 0169](0169-vu-meter-now-playing-overlay.md)). A Sweetwater gear SKU that
estimates **musical key** from the same PCM fits the same ownership pattern without a second
decoder or a plugin `componentSchema` type.

Key detection (chroma + Krumhansl–Schmuckler) is heavier than envelope RMS and should not run on
the Now Playing rAF loop. Non-owners must not download the MIR library chunk.

## Decision

1. **Chromatic Tuner SKU** — `item-shops:chromatic-tuner`, inert catalog (no `use`), rare, 50 coins,
   `availableInRoomTypes: ["radio"]`, sold at **Sweetwater**. Icon `Music2` (`TuningFork` is not in
   the Lucide set we ship).
2. **Mount in `nowPlayingInfo`** — Lazy React in `apps/web` (`ChromaticTuner.tsx`) in the Now Playing
   metadata column (sibling below Beat Detector, above `<PluginArea area="nowPlayingInfo" />`),
   gated by inventory ownership. Not a plugin `componentSchema` type.
3. **UI** — Monospace key label (`C`, `Am`, `F♯`, …) or `—`, plus a retry control. Camelot code
   (e.g. `9A`) in the tooltip only. No pulse / strobe wheel.
4. **Shared tap unchanged** — `acquireAnalysisTap` / `releaseAnalysisTap` + `fillPcmAt` from
   [0167](0167-shared-radio-analysis-tap.md). Dual-wield with Oscilloscope / Beat Detector / VU Meter
   remains one MSE decoder. Chromatic Tuner does **not** call MPEG backfill.
5. **Client-only key in a Worker** — Copy ~15 s of mono PCM from the tap; post it to a module
   Worker that dynamically imports `@audio/mir-chroma` + `@audio/mir-key` (MIT). No server
   round-trip, no chat announce, no audible DSP. Do not route the radio `<audio>` element through
   `MediaElementAudioSourceNode` / `AudioContext.destination`
   ([ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) /
   [0141](0141-radio-mse-transport-and-oscilloscope.md)).
6. **Owner-only lazy load** — `React.lazy` for the UI chunk; Worker spawned only on mount; MIR
   packages imported only inside the Worker. Non-owners never download those assets.
7. **MSE unsupported** — Owner still sees the row with `—`; tap is not started.
8. **Reduce motion** — No decorative animation beyond the detecting spinner
   ([ADR 0136](0136-inventory-owned-client-visuals.md)).

## Consequences

- Sweetwater sells Oscilloscope, VU Meter, Chromatic Tuner, and Beat Detector ([ADR 0175](0175-item-shop-themes-and-assignment-rarity.md)).
- Four inventory visuals may share one analysis worker; listeners owning none still incur no
  decoder.
- STFT/chroma cost stays off the main thread; transferable PCM copies (~15 s every few seconds)
  are accepted so the shared ring is never detached.
- Guess the Tune already leaks BPM to Beat Detector owners; key is the same class of clue — no
  extra obscure gate.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0141](0141-radio-mse-transport-and-oscilloscope.md) — MSE transport and Oscilloscope
- [ADR 0167](0167-shared-radio-analysis-tap.md) — shared analysis tap (refcount + envelope)
- [ADR 0168](0168-beat-detector-now-playing-info.md) — Beat Detector in `nowPlayingInfo`
- [ADR 0169](0169-vu-meter-now-playing-overlay.md) — VU Meter on Now Playing artwork
- [ADR 0175](0175-item-shop-themes-and-assignment-rarity.md) — shop themes and assignment rarity
- [`apps/web/src/components/NowPlaying/ChromaticTuner.tsx`](../../apps/web/src/components/NowPlaying/ChromaticTuner.tsx)
