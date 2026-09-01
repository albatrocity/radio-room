# Plan: Media Source radio transport (and the Oscilloscope it unlocks)

Branch: `explore/mms`. Status: not started.

## Read this first

This plan is written to be followed step by step. Do the phases in order. **Phase 0 is a
throwaway probe that decides whether the rest of the plan is worth building** — do not skip
it, and do not start Phase 1 until Phase 0 passes on a physical iPhone.

Background, and the list of approaches already tried and rejected, is in
[ADR 0140](adrs/0140-radio-element-playback-oscilloscope-tabled.md). Read it before starting.
The short version:

- Radio audio must be owned by an `HTMLMediaElement`, or iOS stops playback when the screen
  locks. This is not negotiable; it has been tested several ways.
- Drawing a waveform needs decoded samples. `captureStream` does not exist in any Safari, a
  second decoded connection cannot be aligned convincingly, and WebKit refuses a service
  worker response whose body script has to pump.
- Media Source Extensions is the one remaining option: **we** feed the bytes to the element,
  so we can decode a copy and know exactly which sample the element is playing.

### What "done" looks like

1. Radio plays through a `MediaSource`-backed element on iPhone Safari, desktop Safari,
   Chrome, and Firefox — or falls back cleanly to the plain-element transport where it can't.
2. Audio keeps playing on iPhone when the screen locks, and the Now Playing card still shows
   title, artist, and artwork.
3. The Oscilloscope draws a trace that is *visibly locked* to the audio — no perceptible lead
   or lag, no drift over a ten-minute listen.
4. Nothing regresses for a listener who does not own the Oscilloscope item.

### When to stop

Abort and report back if any of these turn out to be true. They are cheap to check and each
one kills the approach:

- `MediaSource.isTypeSupported("audio/mpeg")` is false on iPhone Safari. (Working around this
  means transmuxing MP3 into fragmented MP4 in the browser — a much larger project. Stop and
  ask before going there.)
- Appending raw MP3 to a `SourceBuffer` produces no audio on iPhone despite `isTypeSupported`
  returning true.
- MSE-backed playback does not survive a screen lock on iPhone.
- The Now Playing card stops working when the source is a `MediaSource`.

---

## Phase 0 — Probe (half a day, throwaway)

Build a standalone page that answers the four abort questions above, then delete it.

Model it on `apps/web/public/sw-lock-probe/` — that folder is the template for how to run a
device probe in this repo, and its `README.md` explains the HTTPS setup you will need (a
service worker is not involved this time, but a phone still needs a trusted certificate to
reach the dev server; `vite.config.ts` already reads `VITE_HTTPS_KEY` / `VITE_HTTPS_CERT`).

Create `apps/web/public/mse-probe/index.html`. It needs: a stream URL input, a Play button, a
status readout, and an on-page log — **do not rely on Web Inspector**, because attaching a
debugger keeps the page alive and masks the suspension you are trying to measure.

The probe must report:

| Check | How |
| --- | --- |
| Which constructor exists | `window.ManagedMediaSource`, `window.MediaSource`, neither |
| Type support | `isTypeSupported("audio/mpeg")` and `isTypeSupported("audio/aac")` |
| Playback starts | element reaches `playing`, `currentTime` advances |
| Survives lock | wall-clock gap vs `currentTime` gap across a freeze (copy this logic from the sw-lock-probe page) |
| Now Playing works | set `MediaMetadata` with artwork, confirm the card on the lock screen |
| Streaming events | count `startstreaming` / `endstreaming` and log the gaps between them |

Minimal working shape, to save you the API archaeology:

```js
const MSCtor = window.ManagedMediaSource || window.MediaSource
const isManaged = MSCtor === window.ManagedMediaSource
const mime = "audio/mpeg" // no codecs parameter for raw MPEG audio

const audio = document.querySelector("audio")
// ManagedMediaSource refuses to attach unless remote playback is disabled or an
// AirPlay-compatible alternative source is present. Set this BEFORE assigning src.
audio.disableRemotePlayback = true

const source = new MSCtor()
audio.src = URL.createObjectURL(source)

source.addEventListener("sourceopen", () => {
  URL.revokeObjectURL(audio.src)
  source.duration = Infinity // live
  const sb = source.addSourceBuffer(mime)
  sb.mode = "sequence" // raw MPEG frames carry no timestamps; generate them consecutively
  pump(sb)
})

// ManagedMediaSource only: append while it asks for data, stop when it says stop.
source.addEventListener("startstreaming", () => { /* resume reading */ })
source.addEventListener("endstreaming", () => { /* pause reading */ })
```

**Gotchas that will cost you an hour each if you miss them:**

- `sb.appendBuffer()` throws `InvalidStateError` if `sb.updating` is true. Every append and
  every `remove()` must go through a queue that waits for the `updateend` event.
- `sb.mode = "sequence"` must be set before the first append.
- `audio.play()` still has to be called inside a real user gesture on iOS. Calling it before
  any data is appended is fine — playback begins when data arrives.
- Do **not** send an `Icy-MetaData: 1` request header. Interleaved metadata would corrupt the
  bitstream you are appending. Station metadata already arrives by its own path.
- The `fetch` needs CORS to read the body. The station we control sends
  `access-control-allow-origin: *`; a station that does not must fall back (Phase 1).

**Deliverable:** a short written result for each row of the table above, per browser
(iPhone Safari, macOS Safari, Chrome, Firefox). Record it in the ADR you write in Phase 4.
Then delete `apps/web/public/mse-probe/`.

---

## Phase 1 — MSE transport behind a capability check

Goal: radio plays through MSE where supported, through today's plain element everywhere else,
with no visual or behavioural difference to a listener. No Oscilloscope work yet.

### What already exists

`apps/web/src/lib/radioPlaybackElement.ts` is the current transport: it owns a hidden
`<audio>`, and `radioStreamMachine` invokes it through the `elementPlayback` actor. Keep it.
It becomes the fallback, unchanged. You are adding a second transport beside it, not
replacing it.

### 1.1 `apps/web/src/lib/mse/mediaSourceSupport.ts`

```ts
export function getMediaSourceCtor(): typeof MediaSource | null
export function isManagedMediaSource(): boolean
/** First mime the platform will accept, or null. */
export function supportedRadioMimeType(): string | null
export function mseRadioSupported(): boolean
```

Probe `"audio/mpeg"` first, then `"audio/aac"`. No codecs parameter — raw MPEG audio and ADTS
AAC are identified by mime alone, and adding `codecs=` makes `isTypeSupported` return false.
Guard every `window.` access for SSR/test environments (`typeof window === "undefined"`).

Expect Firefox to reject `audio/mpeg`. That is fine — it falls back.

### 1.2 `apps/web/src/lib/mse/mpegFrames.ts`

A frame splitter. Two jobs: never append a partial frame, and give every frame a duration so
the presentation timeline can be computed exactly.

```ts
export type MpegFrame = { bytes: Uint8Array; durationSec: number; sampleRate: number }
/** Returns whole frames plus any trailing partial bytes, which the caller re-prepends. */
export function splitMpegFrames(input: Uint8Array): { frames: MpegFrame[]; remainder: Uint8Array }
```

Frame header is 4 bytes, big-endian. Find an 11-bit sync (`0xFF` then top 3 bits of the next
byte set), then read:

| Bits | Field | Values |
| --- | --- | --- |
| 20–19 | Version | `00`=MPEG2.5, `10`=MPEG2, `11`=MPEG1, `01`=reserved (invalid) |
| 18–17 | Layer | `01`=III, `10`=II, `11`=I, `00`=reserved (invalid) |
| 15–12 | Bitrate index | table lookup, `0000` and `1111` invalid |
| 11–10 | Sample rate index | `11` invalid |
| 9 | Padding | adds 1 byte (4 for Layer I) |

Layer III bitrates (MPEG1, kbps): 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320.
Sample rates: MPEG1 → 44100, 48000, 32000; MPEG2 → half those; MPEG2.5 → a quarter.

Frame length (Layer III) = `144 * bitrate / sampleRate + padding` for MPEG1, and
`72 * bitrate / sampleRate + padding` for MPEG2/2.5, floored.
Samples per frame (Layer III) = 1152 for MPEG1, 576 for MPEG2/2.5.
`durationSec = samplesPerFrame / sampleRate`.

Validate a candidate header by checking that a second valid sync appears at
`offset + frameLength`; this rejects `0xFF` bytes that occur inside audio data. Skip ID3v2
tags (`"ID3"` magic, size is four sync-safe bytes at offset 6).

Unit-test this module against a checked-in fixture of a few hundred real frames. It is the
one piece here with a genuinely fiddly failure mode, and a bug shows up as noise rather than
as an exception.

### 1.3 `apps/web/src/lib/mse/radioMseTransport.ts`

Owns the element, the `MediaSource`, the `SourceBuffer`, the fetch reader, and the append
queue. Export the same surface `radioPlaybackElement` exposes, so the machine can swap
transports without other code changing:

```ts
export function ensureRadioMseElement(): HTMLAudioElement | null
export function startRadioMseStream(url: string): void
export function releaseRadioMse(): void
export function setRadioMseVolume(next: number): void
export function setRadioMseMuted(next: boolean): void
export function teardownRadioMseElement(): void
export function getRadioMseDebug(): RadioMseDebug
```

Implementation notes, in the order they will bite you:

**Append queue.** One array of pending operations; `appendBuffer` or `remove` only when
`!sb.updating`; the `updateend` handler drains the next one. Everything else pushes onto the
queue and returns.

**Read loop.** `fetch(url, { signal })` → `response.body.getReader()`. Concatenate each chunk
onto the remainder from last time, run `splitMpegFrames`, append the whole frames, keep the
remainder. Add each frame's `durationSec` to a running `appendedSec` counter *before*
queueing, and remember the value — Phase 2 needs it.

**Eviction.** Keep roughly 60 seconds. When `sb.buffered.length` and
`buffered.start(0) < audio.currentTime - 60`, queue
`sb.remove(buffered.start(0), audio.currentTime - 30)`. Also catch `QuotaExceededError` from
`appendBuffer`: evict, then retry the same append once. `ManagedSourceBuffer` (the MMS
variant) evicts on its own and fires `bufferedchange`; handle the event by re-checking rather
than assuming your own bookkeeping is still true.

**Streaming gate (ManagedMediaSource only).** Stop reading on `endstreaming` and resume on
`startstreaming`. Ignoring this is not free: iOS penalises a page that streams
unconditionally, including disabling 5G. For a live stream that is consumed at 1x, expect
`streaming` to be true nearly all the time. Decide by measurement whether pausing the reader
(and letting TCP backpressure hold the station off) is enough, or whether you must abort the
fetch and reconnect at the live edge on `startstreaming`. Log both cases in the debug object
so the choice is evidence-based. Plain `MediaSource` has no such events — read continuously
and rely on eviction.

**Latency (optional).** Stations burst several seconds on connect, and MSE will happily play
all of it, so playback starts that far behind live. If that matters, seek once after the
first append: `audio.currentTime = sb.buffered.end(0) - 0.5`. This is a tuning knob, not a
requirement — leave it off until Phase 3.

**Reconnect.** On read error or end of body, retry with backoff. In `sequence` mode the
timeline simply continues across a reconnect; do not touch `timestampOffset`.

**Teardown.** Abort the fetch, `sb.abort()` if updating, `source.endOfStream()` when the
source is still open, revoke the object URL, drop the element.

### 1.4 Wire it into the machine

In `apps/web/src/machines/radioStreamMachine.ts`, add a second actor, `msePlayback`, mirroring
`elementPlayback`: subscribe to the element's `playing` / `ended` / `error` events and send the
same `ELEMENT_PLAYING` / `ELEMENT_ENDED` / `ELEMENT_ERROR` events, so the states, retry budget,
and reconnect logic are shared rather than duplicated.

Choose the transport in the `invoke.src` of the `active` state, from one predicate:

```ts
function useMseTransport(): boolean {
  return radioMseEnabled() && mseRadioSupported()
}
```

`radioMseEnabled()` is the kill switch — read a `localStorage` flag in dev and a build-time
env var otherwise, defaulting to **off** until Phase 3. Being able to turn this off from a
phone without a deploy is worth the ten lines.

**Fallback on failure.** If the MSE transport fails before ever reaching `playing` — no CORS,
an unexpected content type, a source error — fall back to `elementPlayback` for the rest of
the session rather than burning the retry budget. Add a context flag (`mseRejected`) set on
that path and include it in the transport predicate.

`primeRadioStreamPlayerFromGesture()` in `radioStreamActor.ts` must prime whichever transport
is selected, or iOS autoplay breaks.

### Phase 1 acceptance

- Plays on all four browsers; Firefox and any non-CORS station demonstrably take the fallback.
- Screen lock on iPhone: audio continues, Now Playing card intact.
- Pause and resume with no garble (the fresh-connection behaviour of ADR 0138/0140 must hold).
- Ten-minute listen with no stall, and memory flat — watch for the buffer growing without
  eviction, which is the classic MSE leak.
- `npm test -w web` green.

---

## Phase 2 — Aligned analysis tap and the Oscilloscope

Only start once Phase 1 is solid. This is the payoff: because we append the bytes, we can
decode the same bytes and know exactly which sample `audio.currentTime` refers to. There is no
servo and no estimation — that was the flaw in the abandoned approach.

### 2.1 Delete the old analysis path

`apps/web/src/lib/radioAnalysisEngine.ts` and `apps/web/src/lib/radioAudioTap.ts` (plus
`radioAudioTap.test.ts`) implement the second-connection approach and its `DelayNode` servo.
Remove them, along with the `analysis` region of `radioStreamMachine`, the `ANALYSIS_*` events,
the `visible` / `scopeAttached` gating, `installRadioStreamPlayerListeners`, and
`attachRadioScope`. None of it applies now: there is no second connection to gate.

Keep the *interface* `radioAudioTap` exposed to the drawing code —
`fillRadioTimeDomainData(out: Uint8Array): boolean` — so `OscilloscopeBackground` needs almost
no change. Only the implementation behind it moves.

### 2.2 `apps/web/src/lib/mse/analysisTap.ts`

Decode a copy of every frame and keep the PCM in a ring buffer keyed by presentation time.

```ts
export function startAnalysisTap(sampleRateHint?: number): void
export function submitFrames(frames: MpegFrame[], startTimeSec: number): void
export function fillTimeDomainAt(currentTimeSec: number, out: Uint8Array): boolean
export function stopAnalysisTap(): void
```

- Decode with `MPEGDecoderWebWorker` from `mpg123-decoder` (already a dependency) so decoding
  stays off the main thread. Construct it with `{ enableGapless: false }` — gapless trimming
  would drop samples and break the frame-to-sample mapping.
- `submitFrames` is called by the transport's read loop with the **same** frames it appends and
  the `appendedSec` value from *before* that batch. That value is the batch's presentation
  start time, because `sequence` mode assigns timestamps consecutively from zero.
- When the worker returns PCM, write it into the ring at `round(startTimeSec * sampleRate)`.
  Anchoring each batch independently means a decoder-side sample-count discrepancy stays local
  instead of accumulating into drift.
- Ring: one `Float32Array` of `sampleRate * 15` samples, mono (average the channels), plus an
  absolute write index. Fifteen seconds comfortably covers the connect burst.
- `fillTimeDomainAt` maps `currentTimeSec` to an absolute sample index, reads `out.length`
  samples, and converts to the byte format the existing drawing code expects
  (`value * 128 + 128`, clamped to 0–255). Return `false` if the requested window has been
  evicted or not yet decoded, and let the caller draw a flat line.
- The first frame or two of a connection decode to near-silence because of the MP3 bit
  reservoir. Harmless; do not "fix" it.

### 2.3 Point the Oscilloscope at it

`apps/web/src/components/NowPlaying/OscilloscopeBackground.tsx` currently reads an
`AnalyserNode` through `radioAudioTap`. Change it to call `fillTimeDomainAt(audio.currentTime,
buffer)` on each animation frame. Delete the alignment debug fields (`alignmentDelaySec`,
`residual`) from its HUD — there is nothing left to servo — and replace them with whether the
requested window was available.

The item gate is unchanged: `room?.type === "radio" && inventoryOwnsOscilloscope(inventory)`.
The shop SKU, `oscilloscopeOwnership.ts`, and the drawing code are all already on this branch
and need no changes.

When the fallback transport is in use there is no tap, so `fillTimeDomainAt` returns `false`
and the component should render nothing rather than a flat line. Owning the item on a browser
that cannot run MSE is a real state — make sure it looks deliberate.

### Phase 2 acceptance

- Trace is visibly locked to the audio. Test with speech and with a track that has sharp
  transients; a hand-clap or a kick drum makes a millisecond-scale offset obvious.
- No drift after ten minutes.
- Main thread stays smooth — check a performance profile for long tasks from decoding.
- A listener without the item opens no extra work: no decoder worker, no ring buffer.

---

## Phase 3 — Rollout

1. Flip `radioMseEnabled()` to default on, keeping the kill switch.
2. Re-run the full device matrix (below).
3. Decide the burst-latency knob from 1.3 with a real measurement.
4. Confirm the fallback path still works by forcing it (point the kill switch off on a device
   that supports MSE, and separately test a station without CORS headers).

## Phase 4 — Write it up

Write an ADR recording the transport, the fallback chain, the alignment scheme, and the Phase 0
device results. Supersede [ADR 0140](adrs/0140-radio-element-playback-oscilloscope-tabled.md)
and update `docs/adrs/index.md`.

> **Numbering conflict — read before writing the ADR.** This branch carries ADRs 0136–0140 from
> the Oscilloscope exploration. `main` has since taken **0136** for a *different* record
> (`0136-radio-element-playback-and-media-session.md`, the element transport and Media Session
> work ported out of this exploration). When this branch is rebased onto `main`, renumber this
> branch's 0136–0140 to 0141–0145 and fix their cross-references, or the two 0136s will collide.
> Check `docs/adrs/index.md` on `main` for the highest number in use before picking one.

---

## Device test matrix

Run for every phase's acceptance. "Lock" means lock the phone for two minutes with the screen
off, no other apps opened, **and no debugger attached**.

| Device / browser | Plays | Lock | Now Playing + artwork | Scope aligned |
| --- | --- | --- | --- | --- |
| iPhone Safari (iOS 17.1+) | | | | |
| iPhone Safari (iOS 16, pre-MMS) | | fallback expected | | n/a |
| iPad Safari (iPadOS 17+) | | | | |
| macOS Safari | | n/a | | |
| macOS Chrome | | n/a | | |
| macOS Firefox | | n/a | fallback expected | n/a |
| Android Chrome | | | | |

Artwork must be checked on a **physical** device. The iOS Simulator cannot decode the image
MediaRemote is handed, so it always shows a grey box regardless of what the page supplies
([WebKit 247043](https://bugs.webkit.org/show_bug.cgi?id=247043)).

## File map

| Path | Action |
| --- | --- |
| `apps/web/public/mse-probe/` | create in Phase 0, delete at the end of Phase 0 |
| `apps/web/src/lib/mse/mediaSourceSupport.ts` | new |
| `apps/web/src/lib/mse/mpegFrames.ts` | new, unit-tested against a fixture |
| `apps/web/src/lib/mse/radioMseTransport.ts` | new |
| `apps/web/src/lib/mse/analysisTap.ts` | new (Phase 2) |
| `apps/web/src/lib/radioPlaybackElement.ts` | unchanged — this is the fallback |
| `apps/web/src/machines/radioStreamMachine.ts` | add `msePlayback` actor + transport choice; drop the `analysis` region in Phase 2 |
| `apps/web/src/actors/radioStreamActor.ts` | prime the selected transport; drop scope/visibility helpers in Phase 2 |
| `apps/web/src/components/NowPlaying/OscilloscopeBackground.tsx` | read from `analysisTap` |
| `apps/web/src/lib/radioAnalysisEngine.ts` | delete in Phase 2 |
| `apps/web/src/lib/radioAudioTap.ts` (+ test) | delete in Phase 2 |
| `docs/adrs/` | new ADR in Phase 4; mind the numbering conflict above |

## Reference

- [MDN: Media Source Extensions API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API)
- [MDN: ManagedMediaSource](https://developer.mozilla.org/en-US/docs/Web/API/ManagedMediaSource)
- [WebKit: Managed Media Source API](https://webkit.org/blog/14205/managed-media-source-api/)
- [ADR 0140](adrs/0140-radio-element-playback-oscilloscope-tabled.md) — what was tried and why it failed
- `apps/web/public/sw-lock-probe/` — the device-probe pattern to copy for Phase 0
