# 0139. Radio Stream Lifecycle in a Machine, Audio Path Imperative

**Date:** 2026-08-31
**Status:** Accepted (structure stands; [0140](0140-radio-element-playback-oscilloscope-tabled.md) replaced the invoked decode run with an element-playback actor and deleted `radioStreamEngine`)

## Context

`radioStreamPlayer.ts` grew into a ~950 line module that owned both the connection lifecycle and the audio path. Lifecycle lived in module-level booleans and counters — `desiredPlaying`, `suspended`, `runId`, `playbackEpoch`, `outputGateOpen`, `awaitingFirstSchedule`, an `AbortController` used as a state flag, and a bare `setTimeout` for reconnect. Every bug fixed while stabilising [ADR 0138](0138-radio-pause-aborts-fetch.md) was a transition bug: decode results arriving after a pause, resume racing a decoder reset, output ungated at the wrong moment. `playbackEpoch` was a hand-rolled version of what actor identity provides.

[ADR 0004](0004-state-machines-for-ui-and-socket-events.md) already mandates XState for complex client state, and `liveTransportMachine` is the precedent: model the transport lifecycle, keep the media work outside.

## Decision

1. **`machines/radioStreamMachine.ts` owns lifecycle**: play intent, connecting, streaming, reconnect delay, failure. One engine run is `invoke`d per connection, so stopping the invocation (pause, url change, teardown) aborts the fetch, frees the decoder, stops scheduled sources, and mutes output. Stale results cannot reach the speakers, which retires `runId` / `playbackEpoch`.
2. **`lib/radioStreamEngine.ts` owns the audio path** — byte demux, worker decode, PCM conditioning, sample-clock scheduling, gain/unlock. All per-connection state is local to a run. **Audio-rate state stays out of machine context**: typed arrays and a sample clock mutated several times a second, read synchronously against `AudioContext.currentTime`, gain nothing from immutable updates and a snapshot notification per buffer.
3. **`actors/radioStreamActor.ts` is the singleton seam** components use. It bridges machine `emit`s (`playbackStarted`, `failed`) to the `audioActor` callbacks (`LOADED` / `PLAY` / `STOP`).
4. **`audioMachine` remains the source of truth for play intent.** The stream machine follows it; it does not decide whether the user wants audio.
5. **`radioAudioTap` is a registry**, not a wiring layer. The Chromium `captureStream` / `MediaElementSource` ladder and its silence-recovery retries were radio workarounds from before [ADR 0137](0137-radio-stream-player-web-audio.md) and are removed. A live/hybrid visualisation would register its own analyser via `registerRadioStreamAnalyser`.

## Consequences

- Lifecycle is testable without Web Audio: `radioStreamMachine.test.ts` stubs the run actor and asserts pause stops it, url changes restart it, drop-outs reconnect only when audio was delivered, and failures need an explicit play.
- Reconnect backoff is `after`, visible in the state chart rather than a floating timer.
- Trade-off: three files instead of one, and the machine/engine boundary must be respected — new audio-rate state belongs in the run closure, new lifecycle state in the machine.
- The oscilloscope reads the analyser synchronously per animation frame; that stays a plain function call, not an actor round-trip.

## See also

- [ADR 0004](0004-state-machines-for-ui-and-socket-events.md) — state machines for UI state
- [ADR 0137](0137-radio-stream-player-web-audio.md) — radio Web Audio stream player
- [ADR 0138](0138-radio-pause-aborts-fetch.md) — pause aborts the fetch
