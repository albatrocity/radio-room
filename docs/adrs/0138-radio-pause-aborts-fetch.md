# 0138. Radio Pause Aborts Fetch (No Warm MPEG Stream)

**Date:** 2026-08-31
**Status:** Accepted
**Supersedes:** warm-fetch-on-pause clause of [0137](0137-radio-stream-player-web-audio.md)

## Context

[ADR 0137](0137-radio-stream-player-web-audio.md) kept the Icecast `fetch` warm across pause and only suspended PCM scheduling, so resume would be snappy and the Oscilloscope would not open a second socket. In practice, pause discarded live MPEG bytes while the `mpg123` decoder retained bitstream state. Resume then required `reset` + frame resync; that path still produced intermittent drops, pops, and loud HF squeals that heuristics could not reliably filter.

## Decision

1. **Pause tears down the listen path:** mute gain, stop scheduled `AudioBufferSourceNode`s, abort the fetch, and free the decoder.
2. **Resume always reconnects** with a fresh fetch + fresh decoder (still a single connection — no Howler, no second analysis socket).
3. **Soft-start after every connect:** gated gain (fade-in) and a short PCM preroll so the first audible buffer is not a hard edge.
4. **We own buffer depth.** `<audio>`/Howler buffered in native code; the decode pipeline must schedule ~1.2s ahead (up to 3s) and, on underrun, rebuild headroom rather than chase the clock. Frame sync runs once per connection — the decoder retains partial frames, so re-syncing mid-stream drops audio.
5. **We own WebKit autoplay unlock.** Only create the `AudioContext` from the play gesture, and start a silent buffer there. A context created on mount renders the graph (analyser shows a waveform) while WebKit keeps the destination muted — audible silence with a working oscilloscope.
6. **Playback start is announced on the AudioContext clock**, not at schedule time, so the play button's loading state ends when sound does. Connection failure reports an error so the UI leaves loading instead of spinning.
7. Unchanged from 0137: one Web Audio pipeline for listen + analyser; MPEG first; Howler not used for radio.

## Consequences

- Pause → play has a short reconnect delay (connect + decode lock + start buffer) instead of instant warm resume, and playback sits ~1.2s behind live.
- Resume audio quality matches a fresh play; decoder unlock noise from mid-stream discard is gone.
- Server sees a new Icecast client on each resume (same as Howler unload/reload behavior).

## See also

- [ADR 0137](0137-radio-stream-player-web-audio.md) — radio Web Audio stream player
