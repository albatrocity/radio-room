# 0169. VU Meter on Now Playing artwork

**Date:** 2026-09-09
**Status:** Accepted
**Amends:** [0167](0167-shared-radio-analysis-tap.md) (envelope consumer)

## Context

[ADR 0167](0167-shared-radio-analysis-tap.md) introduced a refcounted MSE analysis tap with
envelope RMS hops for follow-on visuals (spectrum, VU). The Oscilloscope ([ADR 0141](0141-radio-mse-transport-and-oscilloscope.md))
paints a full CRT behind Now Playing; the Beat Detector ([ADR 0168](0168-beat-detector-now-playing-info.md))
sits in `nowPlayingInfo`. A Sweetwater gear SKU should show stream level as a compact **analog VU**
without a second decoder or merging SKUs. Absolute overlay in the Oscilloscope band and an in-flow
strip above Add to Queue were tried; the meter belongs on the artwork face instead.

## Decision

1. **VU Meter SKU** — `item-shops:vu-meter`, inert catalog (no `use`), rare, 50 coins,
   `availableInRoomTypes: ["radio"]`, sold at **Sweetwater**. Icon `Gauge`.
2. **Mount on artwork (`nowPlayingArt` region)** — Lazy React in `apps/web` (`VuMeter.tsx`) inside
   the Now Playing artwork host (`[data-now-playing-artwork]`), as a sibling of
   `<PluginArea area="nowPlayingArt" />`: absolute **bottom-left**, **`w={["100%", "50%"]}`** of the artwork
   (full width on mobile, half on `sm+`). Not a plugin `componentSchema` type — inventory gate only, same pattern as Beat
   Detector. Hidden when there is no artwork to host it.
3. **Independent gates** — Oscilloscope and VU Meter use separate inventory checks. Owning both
   draws both (CRT background + artwork-corner meter). Owning only one loads only that chunk.
4. **Envelope RMS** — Drive the needle from `fillEnvelopeAt` (power-mean of recent hops) + client
   ballistics. Game-feel zero: **0 VU ≈ −6 dBFS** (headroom for loud radio; −18 pegged most material).
   Do not read PCM for the meter. Do **not** call MPEG backfill (Oscilloscope-only).
5. **Shared tap** — `acquireAnalysisTap` / `releaseAnalysisTap` ([ADR 0167](0167-shared-radio-analysis-tap.md)).
   Dual-wield with Oscilloscope and/or Beat Detector remains one worker. No audible DSP; no
   `MediaElementAudioSourceNode` routing ([ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) /
   [0141](0141-radio-mse-transport-and-oscilloscope.md)).
6. **MSE unsupported** — Match Oscilloscope: render nothing (`return null`). Needle rests only
   when MSE is active but paused / silent.
7. **Reduce motion** — Cap needle updates at 1 fps ([ADR 0136](0136-inventory-owned-client-visuals.md)).

## Consequences

- Sweetwater sells Oscilloscope and VU Meter; Spy World keeps Beat Detector.
- Envelope hops (already written on decode) gain a first shipped consumer.
- Three inventory visuals may share one analysis worker; listeners owning none still incur no
  decoder.
- VU does not consume Now Playing column height; it overlays artwork only when cover art is shown.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0141](0141-radio-mse-transport-and-oscilloscope.md) — MSE transport and Oscilloscope
- [ADR 0167](0167-shared-radio-analysis-tap.md) — shared analysis tap (refcount + envelope)
- [ADR 0168](0168-beat-detector-now-playing-info.md) — Beat Detector in `nowPlayingInfo`
- [ADR 0171](0171-chromatic-tuner-now-playing-info.md) — Chromatic Tuner in `nowPlayingInfo`
- [`apps/web/src/components/NowPlaying/VuMeter.tsx`](../../apps/web/src/components/NowPlaying/VuMeter.tsx)
