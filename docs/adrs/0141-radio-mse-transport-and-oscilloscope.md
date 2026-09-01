# 0141. Radio MSE Transport and Aligned Oscilloscope

**Date:** 2026-08-31
**Status:** Accepted
**Supersedes:** [0140](0140-radio-element-playback-oscilloscope-tabled.md) (Oscilloscope tabled); restores the inventory-owned Oscilloscope on MSE-capable browsers

## Context

[ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) moved radio playback to a plain
`<audio>` element so iOS lock-screen playback and Media Session work. That ADR correctly ruled out
Web Audio as the audible path, a second decode connection with a `DelayNode` servo, `captureStream`
(no Safari), and service-worker stream teeing (WebKit rejects JS-pumped response bodies).

The remaining option — **Media Source Extensions** — was validated in Phase 0 on a physical iPhone
(see [MMS_RADIO_TRANSPORT_PLAN.md](../MMS_RADIO_TRANSPORT_PLAN.md)). Because we append the MP3
bytes ourselves, the element's `currentTime` maps onto a presentation timeline we control, and
we can decode a copy of the same frames for the Oscilloscope without a second network connection
or alignment guesswork.

## Decision

### 1. Primary transport: MSE-backed `<audio>`

Radio listen uses `apps/web/src/lib/mse/radioMseTransport.ts` when all of the following hold:

- `mseRadioSupported()` — platform accepts `audio/mpeg` or `audio/aac` via `MediaSource` /
  `ManagedMediaSource`
- `radioMseEnabled()` — defaults **on**; disable with `localStorage "radio-mse" = "0"` or
  `VITE_RADIO_MSE=0` at build
- Session has not set `mseRejected` after a pre-playback MSE failure

Implementation highlights:

- Hidden `<audio>` with `disableRemotePlayback = true` before attaching `ManagedMediaSource`
- `SourceBuffer` in `sequence` mode; MP3 frames split by `mpegFrames.ts` with computed durations
- Serialized append/remove via `appendQueue.ts`
- `fetch(url, { mode: "cors" })` — stations without CORS headers cannot use MSE and must fall back
- No `Icy-MetaData: 1` on the fetch; metadata arrives on its own Socket.IO path
- Buffer eviction ~60 s behind `currentTime`; `QuotaExceededError` triggers remove-and-retry
- **ManagedMediaSource:** pause the read loop on `endstreaming`, resume on `startstreaming`
- Reconnect on read end/error with backoff; `sequence` timeline continues across reconnects
- Pause/teardown: abort fetch, end the source, revoke object URL, drop the element (same live-edge
  semantics as [ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) for the fallback)

### 2. Fallback: plain element transport

`apps/web/src/lib/radioPlaybackElement.ts` is unchanged in role — direct `src = url` playback.

The machine (`radioStreamMachine`) chooses transport once per `playbackRun` invoke. If MSE fails
**before** the element reaches `playing` (CORS, unsupported mime, source error), it emits
`MSE_FALLBACK`, sets `mseRejected`, and restarts on the plain element without burning the retry
budget. Firefox (`audio/mpeg` typically false) and non-CORS stations use this path automatically.

Volume/mute/teardown/prime-gesture helpers in `radioStreamActor` route to whichever transport is
active.

### 3. Aligned Oscilloscope via `analysisTap`

When the user owns `item-shops:oscilloscope` in a radio room **and** MSE is the active transport:

- `OscilloscopeBackground` lazy-loads and calls `startAnalysisTap()` on mount
- The transport submits the same MP3 frames it appends, keyed by `appendedSec` before each batch
- `MPEGDecoderWebWorker` (`mpg123-decoder`, `{ enableGapless: false }`) decodes off the main thread
  into a 15 s mono PCM ring buffer
- Each animation frame reads `fillTimeDomainAt(audio.currentTime, out)` — no `AnalyserNode`, no
  servo
- A 60 s rolling frame cache replays into the tap when the oscilloscope mounts mid-stream (e.g.
  after acquiring the item from the shop)
- On plain-element fallback, the component renders nothing (no flat-line placeholder)

Listeners without the item incur no decoder worker or ring buffer. Item gate and shop SKU are
unchanged from [ADR 0136](0136-inventory-owned-client-visuals.md).

### 4. Latency knob (off by default)

Icecast/Shoutcast stations often burst several seconds of audio on connect; MSE plays from the
start of the buffer. `getRadioMseDebug().bufferAheadSec` exposes how far behind live the element
is. Optional seek toward the live edge is available at build time via
`VITE_RADIO_MSE_LIVE_EDGE_SEC=0.5` (margin in seconds). **Default is `0` (disabled)** — acceptance
testing on iPhone Safari showed acceptable latency without seeking; enable only if a station's
connect burst is measurably problematic.

### 5. Lifecycle

[ADR 0139](0139-radio-stream-lifecycle-machine.md) still owns connection state. The parallel
`analysis` region and second-connection machinery from the exploration branch are removed. One
`playbackRun` actor drives either transport.

Media Session behaviour from [ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) decision
4 (stable metadata keys, artwork ordering, physical-device artwork testing) applies unchanged — the
MSE element is still a real playing `HTMLMediaElement`.

## Phase 0 device results (iPhone Safari, 2026-08-31)

Probe stream: `https://stream1.rcast.net/66341`.

| Check | Result |
| --- | --- |
| Constructor | `ManagedMediaSource` |
| `audio/mpeg` | **true** |
| Raw MP3 append + playback | **yes** |
| Survives screen lock | **yes** |
| Now Playing + lock-screen controls | **yes** (pause/resume) |

## Rollout acceptance (2026-08-31)

| Device / browser | Plays | Lock | Now Playing | Scope aligned |
| --- | --- | --- | --- | --- |
| iPhone Safari (iOS 17.1+) | yes | yes | yes | yes |
| macOS Safari / Chrome / Firefox | expected MSE or fallback | n/a | n/a | MSE only |
| Android Chrome | not yet probed | | | |

Artwork on lock screen must still be verified on a **physical** device ([WebKit 247043](https://bugs.webkit.org/show_bug.cgi?id=247043)).

## Consequences

- iOS lock-screen playback and Media Session are preserved — the element still owns decode/output.
- The Oscilloscope ships on MSE-capable browsers with visibly locked trace; no drift servo.
- Firefox and non-CORS stations keep plain-element playback; oscilloscope owners see no scope there
  (deliberate, not a flat line).
- More client code than ADR 0140's element-only path: frame splitter, append queue, worker decode,
  frame cache for mid-session scope mount.
- MSE fetch requires CORS; the fallback preserves play for stations that never added headers.
- Optional live-edge seek is a build-time knob; default off avoids surprising seek on connect.
- Phase 0 probe (`apps/web/public/mse-probe/`) deleted after results were recorded here.

## See also

- [ADR 0136](0136-inventory-owned-client-visuals.md) — inventory-owned client visuals
- [ADR 0139](0139-radio-stream-lifecycle-machine.md) — radio stream lifecycle machine
- [ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) — approaches ruled out; element fallback retained
- [MMS_RADIO_TRANSPORT_PLAN.md](../MMS_RADIO_TRANSPORT_PLAN.md) — implementation plan and file map
