/**
 * Audio engine for radio listen (ADR 0137 / 0138 / 0139).
 *
 * One CORS fetch → MPEG decode → GainNode → destination (audible) and
 * AnalyserNode (oscilloscope). This module owns only audio-rate work: byte
 * demux, worker decode, PCM conditioning, and sample-clock scheduling.
 *
 * Connection lifecycle (play/pause, reconnect, error) belongs to
 * `radioStreamMachine` — a run is started per connection and stopped on pause,
 * so stale decode results can never reach the speakers.
 */

import { MPEGDecoderWebWorker } from "mpg123-decoder"
import {
  registerRadioStreamAnalyser,
  resumeRadioAudioContext,
  ensureRadioAudioContext,
  getExistingRadioAudioContext,
} from "./radioAudioTap"

const CONNECT_TIMEOUT_MS = 10_000
/**
 * Audio scheduled ahead of the speakers before the first buffer plays. Network
 * jitter, worker decode latency, and main-thread jank all eat into this; too
 * small and every hiccup is an audible gap (an `<audio>` element buffers far
 * more than this for us).
 */
const START_BUFFER_SEC = 1.2
/** Stop pulling from the socket once this far ahead (TCP provides backpressure). */
const MAX_SCHEDULE_LOOKAHEAD_SEC = 3
/** After an underrun, rebuild this much headroom instead of chasing the clock. */
const UNDERRUN_REBUFFER_SEC = 0.5
/** Coalesce a little network data before a worker decode round-trip. */
const MIN_DECODE_BYTES = 4 * 1024
/** Fade gain / PCM after connect so the first buffer isn't a hard edge. */
const START_FADE_SEC = 0.08
/** Drop first decoded audio after a fresh connect while the decoder locks. */
const START_PREROLL_SEC = 0.08

export type RadioStreamRunCallbacks = {
  onConnected: (info: { httpStatus: number; contentType: string | null }) => void
  onStreaming: () => void
  /** First scheduled buffer actually reached the speakers. */
  onPlaybackStarted: () => void
  onEnded: (info: { framesScheduled: number }) => void
  onError: (message: string) => void
}

export type RadioStreamRun = {
  stop: () => void
  framesScheduled: () => number
  bufferedAheadSec: () => number | null
  activeSourceCount: () => number
}

let gain: GainNode | null = null
let analyser: AnalyserNode | null = null
let volume = 1
let muted = false
/** Gain stays at 0 until a run reports clean audio; closed again on stop. */
let gateOpen = false
/** WebKit destination output unlocked by a gesture-started buffer. */
let outputUnlocked = false
let unlockListenersAttached = false
/** Current run, for diagnostics only. */
let currentRun: RadioStreamRun | null = null

function applyGain(opts?: { fadeIn?: boolean }): void {
  if (!gain) return
  const ctx = getExistingRadioAudioContext()
  const now = ctx?.currentTime ?? 0
  try {
    gain.gain.cancelScheduledValues(now)
  } catch {
    /* ignore */
  }
  if (!gateOpen) {
    gain.gain.setValueAtTime(0, now)
    return
  }
  const target = muted ? 0 : Math.max(0, Math.min(1, volume))
  if (opts?.fadeIn && ctx) {
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(target, now + START_FADE_SEC)
  } else {
    gain.gain.setValueAtTime(target, now)
  }
}

export function ensureRadioStreamGraph(): { gain: GainNode; analyser: AnalyserNode } | null {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return null
  if (!analyser) {
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    // Low smoothing so the scope tracks transients with the speakers.
    analyser.smoothingTimeConstant = 0.35
  }
  if (!gain) {
    gain = ctx.createGain()
    gain.connect(analyser)
    analyser.connect(ctx.destination)
  }
  applyGain()
  registerRadioStreamAnalyser(analyser)
  return { gain, analyser }
}

export function setRadioStreamVolume(next: number): void {
  volume = next
  applyGain()
}

export function setRadioStreamMuted(next: boolean): void {
  muted = next
  applyGain()
}

export function teardownRadioStreamGraph(): void {
  gateOpen = false
  registerRadioStreamAnalyser(null)
  try {
    gain?.disconnect()
  } catch {
    /* ignore */
  }
  try {
    analyser?.disconnect()
  } catch {
    /* ignore */
  }
  gain = null
  analyser = null
}

/**
 * WebKit keeps destination output muted until a buffer is started inside a user
 * gesture — the graph still renders, so the analyser shows a waveform while
 * nothing is audible. Howler did this for us before ADR 0137.
 */
function unlockOutputFromGesture(): void {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return
  void ctx.resume()
  try {
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = silent
    src.connect(ctx.destination)
    src.start(0)
    outputUnlocked = true
  } catch {
    // Leave listeners attached so the next gesture retries.
    return
  }
  if (ctx.state === "running") removeAutoUnlockListeners()
}

const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const

function removeAutoUnlockListeners(): void {
  if (!unlockListenersAttached) return
  unlockListenersAttached = false
  for (const type of UNLOCK_EVENTS) {
    document.removeEventListener(type, unlockOutputFromGesture, true)
  }
}

/**
 * Unlock on the first gesture anywhere, not just the play button — playback can
 * start from autoplay-on-ready, where no click reaches the player.
 */
export function installRadioStreamAutoUnlock(): () => void {
  if (typeof document === "undefined") return () => {}
  if (!unlockListenersAttached) {
    unlockListenersAttached = true
    for (const type of UNLOCK_EVENTS) {
      document.addEventListener(type, unlockOutputFromGesture, true)
    }
  }
  return removeAutoUnlockListeners
}

/** Resume + unlock on the user-gesture turn (play click). */
export function primeRadioStreamFromGesture(): void {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return
  void ctx.resume()
  ensureRadioStreamGraph()
  unlockOutputFromGesture()
}

function findMpegFrameSync(buf: Uint8Array): number {
  for (let i = 0; i < buf.length - 1; i++) {
    // MPEG frame sync: 11 set bits.
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) return i
  }
  return -1
}

/**
 * Reject NaN/Inf and near-full-scale HF bursts (decoder unlock noise).
 */
function pcmLooksPathological(channelData: Float32Array[], samples: number): boolean {
  const ch = channelData[0]
  if (!ch || samples < 32) return true
  let peak = 0
  let zeroCrossings = 0
  let prev = ch[0] ?? 0
  if (!Number.isFinite(prev)) return true
  const n = Math.min(samples, ch.length)
  for (let i = 0; i < n; i++) {
    const s = ch[i] ?? 0
    if (!Number.isFinite(s)) return true
    const a = Math.abs(s)
    if (a > peak) peak = a
    if ((prev >= 0 && s < 0) || (prev < 0 && s >= 0)) zeroCrossings += 1
    prev = s
  }
  const zcr = zeroCrossings / n
  if (peak >= 0.9 && zcr >= 0.28) return true
  if (peak >= 0.99 && zcr >= 0.18) return true
  return false
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

async function* iterateAudioChunks(
  body: ReadableStream<Uint8Array>,
  icyMetaInt: number,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  let pending = new Uint8Array(0)
  let untilMeta = icyMetaInt > 0 ? icyMetaInt : Number.POSITIVE_INFINITY

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.length) continue
      pending = concatBytes(pending, value)

      if (!(icyMetaInt > 0)) {
        if (pending.length > 0) {
          yield pending
          pending = new Uint8Array(0)
        }
        continue
      }

      while (pending.length > 0 && !signal.aborted) {
        if (untilMeta > 0) {
          const take = Math.min(untilMeta, pending.length)
          if (take > 0) {
            yield pending.subarray(0, take)
            pending = pending.subarray(take)
            untilMeta -= take
          }
          if (untilMeta > 0) break
        }
        if (pending.length < 1) break
        const metaLen = pending[0]! * 16
        if (pending.length < 1 + metaLen) break
        pending = pending.subarray(1 + metaLen)
        untilMeta = icyMetaInt
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

function looksLikeMpeg(contentType: string | null, url: string): boolean {
  const ct = (contentType ?? "").toLowerCase()
  if (ct.includes("mpeg") || ct.includes("mp3") || ct.includes("mpga")) return true
  if (ct.includes("aac") || ct.includes("mp4") || ct.includes("ogg") || ct.includes("opus")) {
    return false
  }
  return !ct || ct.includes("octet-stream") || ct.includes("icy") || url.includes(".mp3")
}

function fetchWithConnectTimeout(url: string, signal: AbortSignal, ms: number): Promise<Response> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), ms)
  const onAbort = () => timeout.abort()
  signal.addEventListener("abort", onAbort)
  return fetch(url, {
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    redirect: "follow",
    signal: timeout.signal,
  }).finally(() => {
    window.clearTimeout(timer)
    signal.removeEventListener("abort", onAbort)
  })
}

/**
 * Start one connection. All per-connection state is local, so a stopped run
 * cannot schedule audio or report status after `stop()`.
 */
export function startRadioStreamRun(url: string, cb: RadioStreamRunCallbacks): RadioStreamRun {
  const controller = new AbortController()
  const signal = controller.signal
  let stopped = false
  let decoder: MPEGDecoderWebWorker | null = null
  let nextStartTime = 0
  let framesScheduled = 0
  const activeSources = new Set<AudioBufferSourceNode>()

  /** Only needed to enter the bitstream — the decoder keeps partial frames. */
  let needsFrameSync = true
  /** First buffer of the run sets the start offset from the live clock. */
  let awaitingFirstSchedule = true
  /** Drop the backlog in the first decoded buffer (Icecast burst-on-connect). */
  let trimConnectBurst = true
  let softStartPending = true
  let softStartSamplesLeft = 0
  let softStartSamplesTotal = 0
  let prerollSamplesLeft = 0
  let startNotified = false

  function stopScheduledSources(): void {
    for (const src of activeSources) {
      try {
        src.stop()
      } catch {
        /* already ended */
      }
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
    }
    activeSources.clear()
  }

  function armSoftStart(sampleRate: number): void {
    softStartSamplesTotal = Math.max(1, Math.floor(START_FADE_SEC * sampleRate))
    softStartSamplesLeft = softStartSamplesTotal
    prerollSamplesLeft = Math.max(0, Math.floor(START_PREROLL_SEC * sampleRate))
  }

  /** Linear fade-in over the start of a buffer (returns copies). */
  function applySoftStart(channelData: Float32Array[], samples: number): Float32Array[] {
    if (softStartSamplesLeft <= 0 || softStartSamplesTotal <= 0) return channelData
    const total = softStartSamplesTotal
    const startOffset = total - softStartSamplesLeft
    const n = Math.min(samples, softStartSamplesLeft)
    const out = channelData.map((ch) => {
      const copy = ch.slice(0, samples)
      for (let i = 0; i < n; i++) {
        const g = Math.min(1, (startOffset + i) / total)
        copy[i] = (copy[i] ?? 0) * g
      }
      return copy
    })
    softStartSamplesLeft = Math.max(0, softStartSamplesLeft - samples)
    return out
  }

  /**
   * Buffers are scheduled a start buffer ahead of the speakers, so reporting
   * "playing" at schedule time leaves the UI live before any sound. Announce on
   * the AudioContext clock instead.
   */
  function notifyPlaybackStartedAt(ctx: AudioContext, startAt: number): void {
    const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000)
    window.setTimeout(() => {
      if (stopped) return
      cb.onPlaybackStarted()
    }, delayMs)
  }

  function schedulePcm(
    ctx: AudioContext,
    channelData: Float32Array[],
    samplesDecoded: number,
    sampleRate: number,
  ): void {
    if (stopped || samplesDecoded <= 0 || channelData.length === 0) return

    // Only guard while the decoder is locking onto a new connection. Mid-stream the
    // heuristic false-positives on loud dense material (dropping real audio) and
    // costs a full scan of every buffer on the main thread.
    const inStartWindow = !gateOpen || softStartSamplesLeft > 0
    if (inStartWindow && pcmLooksPathological(channelData, samplesDecoded)) return

    let samples = samplesDecoded
    let channels = channelData

    if (prerollSamplesLeft > 0) {
      if (samples <= prerollSamplesLeft) {
        prerollSamplesLeft -= samples
        return
      }
      const skip = prerollSamplesLeft
      prerollSamplesLeft = 0
      channels = channelData.map((ch) => ch.subarray(skip, samplesDecoded))
      samples = samplesDecoded - skip
      if (pcmLooksPathological(channels, samples)) return
    }

    channels = applySoftStart(channels, samples)

    const graph = ensureRadioStreamGraph()
    if (!graph) return

    // First clean audible buffer of the run — open the gate with a gain fade.
    if (!gateOpen && prerollSamplesLeft <= 0) {
      gateOpen = true
      applyGain({ fadeIn: true })
    }

    const now = ctx.currentTime
    const buffer = ctx.createBuffer(channels.length, samples, sampleRate)
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c]
      if (!src) continue
      const copy = src.length === samples ? src : src.subarray(0, samples)
      buffer.getChannelData(c).set(copy)
    }

    const srcNode = ctx.createBufferSource()
    srcNode.buffer = buffer
    srcNode.connect(graph.gain)
    srcNode.onended = () => {
      activeSources.delete(srcNode)
    }
    activeSources.add(srcNode)

    if (awaitingFirstSchedule) {
      awaitingFirstSchedule = false
      nextStartTime = now + START_BUFFER_SEC
    } else if (nextStartTime < now + 0.03) {
      // Underrun: one gap is unavoidable, so take it and rebuild headroom rather
      // than scheduling flush against the clock and gapping on every buffer.
      nextStartTime = now + UNDERRUN_REBUFFER_SEC
    }
    const startAt = nextStartTime
    try {
      srcNode.start(startAt)
    } catch {
      activeSources.delete(srcNode)
      return
    }
    nextStartTime = startAt + samples / sampleRate
    framesScheduled += 1

    if (!startNotified) {
      startNotified = true
      notifyPlaybackStartedAt(ctx, startAt)
    }
  }

  async function waitForScheduleSlot(ctx: AudioContext): Promise<void> {
    while (!stopped && nextStartTime > ctx.currentTime + MAX_SCHEDULE_LOOKAHEAD_SEC) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 20)
      })
    }
  }

  async function runDecodeLoop(
    body: ReadableStream<Uint8Array>,
    icyMetaInt: number,
    ctx: AudioContext,
  ): Promise<void> {
    const dec = new MPEGDecoderWebWorker()
    try {
      await dec.ready
      if (stopped) {
        await dec.free()
        return
      }
      decoder = dec
      cb.onStreaming()

      let netBuf = new Uint8Array(0)
      for await (const chunk of iterateAudioChunks(body, icyMetaInt, signal)) {
        if (stopped) break
        if (!chunk.length) continue

        netBuf = concatBytes(netBuf, chunk)
        if (netBuf.length < MIN_DECODE_BYTES) continue

        let toDecode = netBuf
        netBuf = new Uint8Array(0)

        if (needsFrameSync) {
          const syncAt = findMpegFrameSync(toDecode)
          if (syncAt < 0) {
            // Keep a small tail in case sync straddles chunks.
            netBuf =
              toDecode.length > 2048 ? toDecode.subarray(toDecode.length - 2048) : toDecode
            continue
          }
          if (syncAt > 0) toDecode = toDecode.subarray(syncAt)
          needsFrameSync = false
        }

        let decoded
        try {
          decoded = await dec.decode(toDecode)
        } catch {
          continue
        }
        if (stopped) break
        if (decoded.samplesDecoded <= 0) continue

        if (softStartPending) {
          armSoftStart(decoded.sampleRate)
          softStartPending = false
        }

        let channels: Float32Array[] = decoded.channelData
        let samples = decoded.samplesDecoded

        // Icecast burst-on-connect hands over several seconds at once. Keep only
        // the newest audio so playback starts near the live edge, not behind it.
        if (trimConnectBurst) {
          trimConnectBurst = false
          const keep = Math.floor(START_BUFFER_SEC * decoded.sampleRate)
          if (samples > keep) {
            channels = channels.map((ch) => ch.subarray(samples - keep, samples))
            samples = keep
          }
        }

        await waitForScheduleSlot(ctx)
        if (stopped) break
        schedulePcm(ctx, channels, samples, decoded.sampleRate)
      }

      if (!stopped) cb.onEnded({ framesScheduled })
    } catch (err) {
      if (!stopped) cb.onError(err instanceof Error ? err.message : String(err))
    } finally {
      decoder = null
      try {
        await dec.free()
      } catch {
        /* ignore */
      }
    }
  }

  async function connect(): Promise<void> {
    const ctx = ensureRadioAudioContext()
    if (!ctx) {
      cb.onError("noAudioContext")
      return
    }
    resumeRadioAudioContext()
    ensureRadioStreamGraph()

    try {
      if (ctx.state === "suspended") await ctx.resume()

      let response: Response
      try {
        response = await fetchWithConnectTimeout(url, signal, CONNECT_TIMEOUT_MS)
      } catch (err) {
        if (stopped) return
        const name = err instanceof Error ? err.name : ""
        const message = err instanceof Error ? err.message : String(err)
        cb.onError(
          name === "AbortError" || /abort/i.test(message)
            ? `connectTimeout ${CONNECT_TIMEOUT_MS}ms`
            : message,
        )
        return
      }
      if (stopped) return

      const contentType = response.headers.get("content-type")
      const icyHeader = response.headers.get("icy-metaint")
      const icyMetaInt = icyHeader ? Number(icyHeader) : 0
      cb.onConnected({ httpStatus: response.status, contentType })

      if (!response.ok) {
        cb.onError(`http ${response.status}`)
        return
      }
      if (!response.body) {
        cb.onError("noResponseBody")
        return
      }
      if (!looksLikeMpeg(contentType, url)) {
        cb.onError(`unsupportedContentType:${contentType ?? "unknown"}`)
        return
      }

      await runDecodeLoop(response.body, Number.isFinite(icyMetaInt) ? icyMetaInt : 0, ctx)
    } catch (err) {
      if (stopped) return
      cb.onError(err instanceof Error ? err.message : String(err))
    }
  }

  const run: RadioStreamRun = {
    stop: () => {
      if (stopped) return
      stopped = true
      // Mute first, then tear down — never let a half-decoded buffer drain out.
      gateOpen = false
      applyGain()
      controller.abort()
      stopScheduledSources()
      const d = decoder
      decoder = null
      if (d) void d.free().catch(() => {})
      if (currentRun === run) currentRun = null
    },
    framesScheduled: () => framesScheduled,
    bufferedAheadSec: () => {
      const ctx = getExistingRadioAudioContext()
      if (!ctx) return null
      return Math.max(0, nextStartTime - ctx.currentTime)
    },
    activeSourceCount: () => activeSources.size,
  }

  currentRun = run
  void connect()
  return run
}

export type RadioStreamEngineDebug = {
  contextState: string | null
  contextSampleRate: number | null
  currentTime: number | null
  bufferedAheadSec: number | null
  gainValue: number | null
  gateOpen: boolean
  outputUnlocked: boolean
  activeSources: number
  framesScheduled: number
  volume: number
  muted: boolean
  analyserConnected: boolean
}

export function getRadioStreamEngineDebug(): RadioStreamEngineDebug {
  const ctx = getExistingRadioAudioContext()
  return {
    contextState: ctx?.state ?? null,
    contextSampleRate: ctx?.sampleRate ?? null,
    currentTime: ctx?.currentTime ?? null,
    bufferedAheadSec: currentRun?.bufferedAheadSec() ?? null,
    gainValue: gain?.gain.value ?? null,
    gateOpen,
    outputUnlocked,
    activeSources: currentRun?.activeSourceCount() ?? 0,
    framesScheduled: currentRun?.framesScheduled() ?? 0,
    volume,
    muted,
    analyserConnected: Boolean(analyser),
  }
}
