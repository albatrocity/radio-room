# 0137. Radio Stream Player (Web Audio Decode, No Howler)

**Date:** 2026-08-31
**Status:** Accepted (pause/resume amended by [0138](0138-radio-pause-aborts-fetch.md))

## Context

Radio listen used ReactHowler (`html5: true`) while the Oscilloscope (ADR 0136) needed an `AnalyserNode`. On Chromium, `captureStream` worked. On Safari/WebKit, `HTMLAudioElement` has no `captureStream`, and `MediaElementAudioSourceNode` feeds silence into the Web Audio graph for Icecast while `<audio>` still plays ([WebKit 180696](https://bugs.webkit.org/show_bug.cgi?id=180696)). A Safari-only second `fetch` + MPEG decode path fixed the scope but opened a **second** Icecast connection beside Howler, which caused pause/resume delay and garbled audio. Controllability for radio already lives in `audioActor` → `RadioPlayer` props — other Howler usages (track preview, SFX) do not drive the radio Howl.

## Decision

1. **Radio rooms play through one Web Audio decode pipeline** (`radioStreamEngine`, driven by `radioStreamMachine` — [ADR 0139](0139-radio-stream-lifecycle-machine.md)): CORS `fetch` → `mpg123-decoder` → `GainNode` → `AnalyserNode` → `destination`. Volume/mute are gain; unmount aborts the fetch. **Pause/resume:** see [ADR 0138](0138-radio-pause-aborts-fetch.md) (abort on pause, reconnect on resume — not warm-fetch).
2. **Do not use Howler / ReactHowler for radio.** Keep Howler for track preview and sound effects only (including the existing HTML5 `crossOrigin` pool patch).
3. **Oscilloscope reads the same `AnalyserNode`** via `registerRadioStreamAnalyser` — no Safari branch, no second socket.
4. **MPEG (mp3) first.** Non-MPEG listen URLs error clearly until another decoder is added.
5. **Live / hybrid** may still register an `HTMLAudioElement` with the tap for Chromium `captureStream` / MES; that path is unrelated to radio Howler removal.

This amends the radio-specific parts of [ADR 0136](0136-inventory-owned-client-visuals.md) decision (4).

## Consequences

- One Icecast connection for listen + oscilloscope on all browsers that can decode MPEG in WASM.
- Radio owns buffering/reconnect behavior (no Howler pool). Preview ducking still works via muted gain.
- Safari and Chromium share the same radio code path.
- Trade-off: decode CPU on the client; AAC/Opus radio streams need follow-up decoders or a fallback.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- Preview ducking via muted gain on the stream player (same as prior Howler `mute` prop)
