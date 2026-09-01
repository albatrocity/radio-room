# 0140. Radio Playback Owned by an `<audio>` Element; Oscilloscope Tabled

**Date:** 2026-08-31
**Status:** Accepted
**Supersedes:** decisions 1 and 3 of [0137](0137-radio-stream-player-web-audio.md); decisions 3, 4, 5 and 6 of [0138](0138-radio-pause-aborts-fetch.md); the radio analysis clause of [0136](0136-inventory-owned-client-visuals.md)

This ADR consolidates the whole radio-audio exploration. It records what shipped, what was abandoned, and — importantly — which approaches were tested and ruled out, so they are not attempted again.

## Context

[ADR 0137](0137-radio-stream-player-web-audio.md) moved radio listen off Howler onto a single Web Audio pipeline so the Oscilloscope ([ADR 0136](0136-inventory-owned-client-visuals.md)) could read an `AnalyserNode` on Safari, where `HTMLMediaElement.captureStream` does not exist and `MediaElementAudioSourceNode` feeds silence for cross-origin Icecast ([WebKit 180696](https://bugs.webkit.org/show_bug.cgi?id=180696)).

That pipeline regressed a more important behaviour: **radio stops on iOS the moment the screen locks.** iOS interrupts the `AudioContext` when the screen goes off, and the pipeline's only audible output is `ctx.destination`. Howler's `html5: true` element survived this; the decode pipeline cannot.

Two bridges were ruled out. `MediaElementAudioSourceNode` routes element audio back into the graph, so output depends on the context again and dies on lock — and it is the call WebKit feeds silence for. `MediaStreamAudioDestinationNode` into `<audio srcObject>` looks like an escape hatch, but the audio still originates in the AudioContext, so an interrupt silences it regardless of the attached element.

We also tested, on device, whether an `<audio>` element holding the iOS audio session would keep a concurrent `AudioContext` rendering across a lock. It does not: with a silent element confirmed playing, the context clock stopped advancing at lock and audio cut immediately.

The remaining constraint is structural. Keeping audio alive through an iOS lock requires an `HTMLMediaElement` to own decode and output. Reading samples requires either `captureStream` (absent in Safari) or our own decode. Therefore **the audible path and the analysed path cannot be the same connection on iOS**, and a second connection cannot be aligned convincingly (see "Why the Oscilloscope is tabled").

## Decision

1. **An `HTMLAudioElement` owns radio playback on every platform.** The element is created by `radioPlaybackElement`, plays the station URL directly, and is never routed through an `AudioContext`. Lock-screen playback, background playback, native buffering, and Media Session all come back as a result. No `crossOrigin` is set — we never read samples from this element, so stations without CORS headers still play.

2. **Pause drops the element's source** (`pause()`, `removeAttribute("src")`, `load()`), carrying decisions 1 and 2 of [ADR 0138](0138-radio-pause-aborts-fetch.md) over to the element transport. Merely pausing leaves a buffer the station has moved past; resuming into it plays a discontinuous bitstream and squeals exactly like the decode path did. Live radio has no position worth resuming, so every play is a fresh connection at the live edge. The source is re-assigned inside the user-gesture turn, keeping the iOS autoplay chain intact.

3. **Volume is a runtime capability, not a platform check.** `HTMLMediaElement.volume` is inert on iOS, where hardware buttons own level. `radioPlaybackElement` probes whether `volume` is settable and the UI hides the slider where it is not. Mute and preview ducking use `element.muted`, which iOS *does* honour, so ducking keeps its snappy behaviour everywhere and needs no pause-and-reconnect fallback.

4. **Media Session metadata is applied only when its values change.** Assigning `session.metadata` makes the OS re-fetch artwork, and `useStationMeta` returns a fresh object on every server meta tick — so keying the effect on object identity (or clearing and re-applying on each run) restarts the fetch every few seconds and the cover never renders while the title does. Metadata, playback state, and action handlers are set through separate calls for the same reason. Lock-screen artwork follows the same room-artwork precedence as the Now Playing panel, and the array is ordered closest-to-512px first — WebKit scores candidates against a 512x512 ideal ([WebKit#30598](https://github.com/WebKit/WebKit/pull/30598)), and older versions read only the first entry.

   **Artwork cannot be verified in the iOS Simulator.** WebKit hands the image to MediaRemote, which validates dimensions by decoding it; that decode is unavailable in the Simulator, so the card renders text with a grey artwork box no matter what the page supplies ([WebKit 247043](https://bugs.webkit.org/show_bug.cgi?id=247043)). Test lock-screen artwork on a physical device only.

5. **Lifecycle stays in the machine** ([ADR 0139](0139-radio-stream-lifecycle-machine.md)), with a single `playback` region driven by element events. The parallel `analysis` region is removed along with the Oscilloscope.

6. **The Oscilloscope does not ship.** No analysis decode, no `AnalyserNode`, no second connection. `radioAnalysisEngine`, `radioAudioTap`, `OscilloscopeBackground`, `oscilloscopeOwnership`, and the `item-shops:oscilloscope` SKU stay on `feature/oscilloscope-item` and are not carried forward.

7. Unchanged from 0137: Howler is not used for radio; it remains for track preview and sound effects. The MPEG-first constraint disappears with the decode path — any format the element plays now works.

## Why the Oscilloscope is tabled

Feeding a waveform requires PCM. Four ways to get it were tried or evaluated:

| Approach | Result |
| --- | --- |
| Web Audio owns playback (ADR 0137) | Works everywhere, but kills iOS lock-screen playback. Rejected. |
| Second silent connection, decoded for analysis | Ships, but the trace cannot be convincingly aligned. Both connections read the live edge with independent, drifting buffers; a measured `DelayNode` servo narrowed the error without making it convincing. |
| `HTMLMediaElement.captureStream` | Absent in all Safari, desktop and iOS. Would have given perfect alignment on Chromium/Firefox only. |
| Service worker tees the stream | **Rejected by WebKit.** Verified on device. |

The service worker result is worth recording precisely, because the idea is appealing and will come up again. A worker that returns the fetched `Response` **unmodified** plays fine on iOS and survives a screen lock. A worker that rebuilds the body from a JS stream — `pipeThrough`, `tee()`, or manual enqueue — fails immediately with `MEDIA_ERR_SRC_NOT_SUPPORTED`. WebKit will hand a media element a response backed by a network load, but not one that script must pump. Since teeing the bytes is the entire reason to involve a worker, the approach cannot feed a visualisation. The language is irrelevant: a WASM/Rust worker calls the same `Response` constructor and produces the same object.

The probe used to establish this is on `feature/oscilloscope-item` at `apps/web/public/sw-lock-probe/`.

## Consequences

- iOS keeps playing when the screen locks, which was the point.
- The element buffers in native code, so the drop, underrun, and frame-sync class of bugs that [ADR 0138](0138-radio-pause-aborts-fetch.md) fought no longer affects what listeners hear.
- One playback transport on all browsers, and no `AudioContext` in the radio path at all. Substantially less code than 0137/0138 left behind.
- Media Session becomes more reliable, since iOS anchors the now-playing card to a real playing element rather than to a session the page merely holds.
- **Cost:** no in-app volume slider on iOS. This matches pre-0137 Howler behaviour and is the accepted price of lock-screen playback; the mute button still works.
- **Cost:** no Oscilloscope on any platform, and no room-visual precedent for [ADR 0136](0136-inventory-owned-client-visuals.md) to stand on until one returns.
- Anything that needs to *process* radio audio (reverb, distortion, any effect) still requires an `AudioContext` and therefore still costs iOS lock-screen playback. That trade is unchanged by this ADR.

## Path forward

Media Source Extensions is the only remaining way to hold the bytes and keep an element. `ManagedMediaSource` (Safari 17.0 desktop/iPadOS, 17.1 iPhone) and `MediaSource` (everywhere else) are API-compatible for our purposes, so one transport covers all browsers — unlike `captureStream`, this is not a platform branch. Because we would append the bytes ourselves, the element's `currentTime` maps deterministically onto our own timeline and alignment stops being a guess.

Tracked on `explore/mms`, where [the implementation plan](../MMS_RADIO_TRANSPORT_PLAN.md) sets
out the phases, the device matrix, and the checks that would abort the attempt. Not scheduled.

## Posterity

A fully working Oscilloscope exists in this branch's history, fed by the ADR 0137 Web Audio pipeline:

- `e9ef8562` — working, needs cleanup
- `6ff0d549` — radioStream state machine

Both predate the move to element playback, so the Oscilloscope works there at the cost of iOS lock-screen playback. Recover the drawing code, the shop item, and the ownership gate from those commits rather than rewriting them.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0137](0137-radio-stream-player-web-audio.md) — the Web Audio decode pipeline this replaces
- [ADR 0138](0138-radio-pause-aborts-fetch.md) — the audible-quality machinery this makes unnecessary
- [ADR 0139](0139-radio-stream-lifecycle-machine.md) — lifecycle in a machine, audio path imperative
