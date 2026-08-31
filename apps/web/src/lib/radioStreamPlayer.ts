/**
 * Single Icecast/Shoutcast listen path for radio rooms (ADR 0137 / 0138).
 *
 * One CORS fetch → MPEG decode → GainNode → destination (audible) and
 * AnalyserNode (oscilloscope). No Howler, no MediaElementSource, no second
 * analysis socket.
 *
 * Pause aborts the fetch and frees the decoder. Resume opens a fresh
 * connection — warm-pause cannot keep MPEG continuous after discarded bytes.
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

type Decoder = MPEGDecoderWebWorker

export type RadioStreamPlayerStatus = {
  phase: "idle" | "connecting" | "streaming" | "error"
  url: string | null
  contentType: string | null
  httpStatus: number | null
  error: string | null
  framesScheduled: number
  suspended: boolean
  playingDesired: boolean
}

type Listener = () => void

type PlayerCallbacks = {
  onLoad?: () => void
  onPlay?: () => void
  onError?: (message: string) => void
}

let abort: AbortController | null = null
let decoder: Decoder | null = null
let gain: GainNode | null = null
let analyser: AnalyserNode | null = null
let nextStartTime = 0
let runId = 0
let suspended = true
let desiredPlaying = false
let volume = 1
let muted = false
let loadedNotified = false
let playNotified = false
let callbacks: PlayerCallbacks = {}
const statusListeners = new Set<Listener>()
/** Sources already started — must be stopped on pause or they drain for seconds. */
const activeSources = new Set<AudioBufferSourceNode>()
/** Arm PCM fade / preroll on the first decoded buffer of a new connection. */
let softStartPending = false
/** Samples left to multiply by a rising envelope after connect. */
let softStartSamplesLeft = 0
let softStartSamplesTotal = 0
/** Samples to discard entirely after connect (decoder warm-up). */
let prerollSamplesLeft = 0
/**
 * Bumped on every pause / teardown. Decode results from an older epoch are
 * discarded so in-flight work never reaches the speakers after stop.
 */
let playbackEpoch = 0
/**
 * Keep gain at 0 until the first clean post-connect buffer is ready.
 */
let outputGateOpen = false
/** First buffer of a connection sets the start offset from the live clock. */
let awaitingFirstSchedule = true
/** onLoad/onPlay are announced once per connection, timed to the first buffer. */
let startNotifyScheduled = false
/** Drop the backlog in the first decoded buffer of a connection (Icecast burst). */
let trimConnectBurst = true
/** WebKit destination output unlocked by a gesture-started buffer. */
let outputUnlocked = false
let unlockListenersAttached = false
/**
 * MPEG frame sync is only needed to enter the bitstream. After that the decoder
 * keeps partial frames itself — re-syncing every chunk would discard the tail of
 * a frame it is holding, which is heard as a dropout.
 */
let needsFrameSync = true

let status: RadioStreamPlayerStatus = {
  phase: "idle",
  url: null,
  contentType: null,
  httpStatus: null,
  error: null,
  framesScheduled: 0,
  suspended: true,
  playingDesired: false,
}

export function getRadioStreamPlayerStatus(): RadioStreamPlayerStatus {
  return { ...status, suspended, playingDesired: desiredPlaying }
}

export function subscribeRadioStreamPlayerStatus(listener: Listener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function notifyStatus(): void {
  for (const listener of statusListeners) listener()
}

function setStatus(patch: Partial<RadioStreamPlayerStatus>): void {
  status = { ...status, ...patch, suspended, playingDesired: desiredPlaying }
  notifyStatus()
}

function applyGain(opts?: { fadeIn?: boolean }): void {
  if (!gain) return
  const ctx = ensureRadioAudioContext()
  const now = ctx?.currentTime ?? 0
  try {
    gain.gain.cancelScheduledValues(now)
  } catch {
    /* ignore */
  }
  // Pause / gated start must stay silent until clean audio is ready.
  if (suspended || !desiredPlaying || !outputGateOpen) {
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
function pcmLooksPathological(
  channelData: Float32Array[],
  samples: number,
): boolean {
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

function openOutputGate(): void {
  if (outputGateOpen) return
  outputGateOpen = true
  applyGain({ fadeIn: true })
}

function armSoftStart(sampleRate: number): void {
  softStartSamplesTotal = Math.max(1, Math.floor(START_FADE_SEC * sampleRate))
  softStartSamplesLeft = softStartSamplesTotal
  prerollSamplesLeft = Math.max(0, Math.floor(START_PREROLL_SEC * sampleRate))
}

/**
 * Apply a linear fade-in to the start of a PCM buffer (mutates a copy).
 * Returns channel arrays ready for copyToChannel.
 */
function applySoftStart(
  channelData: Float32Array[],
  samplesDecoded: number,
): Float32Array[] {
  if (softStartSamplesLeft <= 0 || softStartSamplesTotal <= 0) return channelData
  const total = softStartSamplesTotal
  const startOffset = total - softStartSamplesLeft
  const n = Math.min(samplesDecoded, softStartSamplesLeft)
  const out = channelData.map((ch) => {
    const copy = ch.slice(0, samplesDecoded)
    for (let i = 0; i < n; i++) {
      const g = Math.min(1, (startOffset + i) / total)
      copy[i] = (copy[i] ?? 0) * g
    }
    return copy
  })
  softStartSamplesLeft = Math.max(0, softStartSamplesLeft - samplesDecoded)
  return out
}

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
  const ctx = getExistingRadioAudioContext()
  if (ctx) nextStartTime = ctx.currentTime
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

function fetchWithConnectTimeout(
  url: string,
  signal: AbortSignal,
  ms: number,
): Promise<Response> {
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

function ensureGraph(ctx: AudioContext): { gain: GainNode; analyser: AnalyserNode } {
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

async function waitForScheduleSlot(
  ctx: AudioContext,
  signal: AbortSignal,
): Promise<void> {
  while (
    !signal.aborted &&
    desiredPlaying &&
    !suspended &&
    nextStartTime > ctx.currentTime + MAX_SCHEDULE_LOOKAHEAD_SEC
  ) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 20)
    })
  }
}

function schedulePcm(
  ctx: AudioContext,
  channelData: Float32Array[],
  samplesDecoded: number,
  sampleRate: number,
  epoch: number,
): void {
  if (epoch !== playbackEpoch) return
  if (suspended || !desiredPlaying) return
  if (samplesDecoded <= 0 || channelData.length === 0) return

  // Only guard while the decoder is locking onto a new connection. Mid-stream the
  // heuristic false-positives on loud dense material (dropping real audio) and
  // costs a full scan of every buffer on the main thread.
  const inStartWindow = !outputGateOpen || softStartSamplesLeft > 0
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

  // First clean audible buffer after connect — open the gate with a gain fade.
  if (!outputGateOpen && prerollSamplesLeft <= 0) {
    openOutputGate()
  }

  const now = ctx.currentTime
  const { gain: g } = ensureGraph(ctx)
  const buffer = ctx.createBuffer(channels.length, samples, sampleRate)
  for (let c = 0; c < channels.length; c++) {
    const src = channels[c]
    if (!src) continue
    const copy = src.length === samples ? src : src.subarray(0, samples)
    buffer.getChannelData(c).set(copy)
  }

  const srcNode = ctx.createBufferSource()
  srcNode.buffer = buffer
  srcNode.connect(g)
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
  status.framesScheduled += 1

  if (!startNotifyScheduled) {
    startNotifyScheduled = true
    notifyPlaybackStartedAt(ctx, startAt, epoch)
  }
}

/**
 * Buffers are scheduled a start buffer ahead of the speakers, so reporting
 * "playing" at schedule time leaves the UI live before any sound. Announce on
 * the AudioContext clock instead, so the button's loading state ends with audio.
 */
function notifyPlaybackStartedAt(ctx: AudioContext, startAt: number, epoch: number): void {
  const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000)
  window.setTimeout(() => {
    if (epoch !== playbackEpoch || suspended || !desiredPlaying) return
    if (!loadedNotified) {
      loadedNotified = true
      callbacks.onLoad?.()
    }
    if (!playNotified) {
      playNotified = true
      callbacks.onPlay?.()
    }
  }, delayMs)
}

async function runDecodeLoop(
  myRun: number,
  body: ReadableStream<Uint8Array>,
  icyMetaInt: number,
  signal: AbortSignal,
  ctx: AudioContext,
): Promise<void> {
  const dec = new MPEGDecoderWebWorker()
  try {
    await dec.ready
    if (myRun !== runId || signal.aborted) {
      await dec.free()
      return
    }
    decoder = dec
    softStartPending = true
    setStatus({ phase: "streaming", error: null })

    let netBuf = new Uint8Array(0)
    for await (const chunk of iterateAudioChunks(body, icyMetaInt, signal)) {
      if (myRun !== runId || signal.aborted) break
      if (!chunk.length) continue
      if (suspended || !desiredPlaying) break

      const merged = new Uint8Array(netBuf.length + chunk.length)
      merged.set(netBuf)
      merged.set(chunk, netBuf.length)
      netBuf = merged
      if (netBuf.length < MIN_DECODE_BYTES) continue

      let toDecode = netBuf
      netBuf = new Uint8Array(0)

      if (needsFrameSync) {
        const syncAt = findMpegFrameSync(toDecode)
        if (syncAt < 0) {
          // Keep a small tail in case sync straddles chunks.
          netBuf = toDecode.length > 2048 ? toDecode.subarray(toDecode.length - 2048) : toDecode
          continue
        }
        if (syncAt > 0) toDecode = toDecode.subarray(syncAt)
        needsFrameSync = false
      }

      const epochAtDecode = playbackEpoch
      let decoded
      try {
        decoded = await dec.decode(toDecode)
      } catch (err) {
        setStatus({
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      // Pause/teardown may have happened during await decode — never play that result.
      if (
        epochAtDecode !== playbackEpoch ||
        myRun !== runId ||
        signal.aborted ||
        suspended ||
        !desiredPlaying
      ) {
        continue
      }

      if (decoded.samplesDecoded > 0) {
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

        await waitForScheduleSlot(ctx, signal)
        if (
          epochAtDecode !== playbackEpoch ||
          signal.aborted ||
          suspended ||
          !desiredPlaying ||
          myRun !== runId
        ) {
          continue
        }
        schedulePcm(ctx, channels, samples, decoded.sampleRate, epochAtDecode)
      }
    }

    if (netBuf.length > 0 && myRun === runId && !signal.aborted && desiredPlaying && !suspended) {
      try {
        const epochAtDecode = playbackEpoch
        const decoded = await dec.decode(netBuf)
        if (
          decoded.samplesDecoded > 0 &&
          epochAtDecode === playbackEpoch &&
          !suspended &&
          desiredPlaying
        ) {
          await waitForScheduleSlot(ctx, signal)
          if (epochAtDecode === playbackEpoch && !signal.aborted && !suspended && desiredPlaying) {
            schedulePcm(
              ctx,
              decoded.channelData,
              decoded.samplesDecoded,
              decoded.sampleRate,
              epochAtDecode,
            )
          }
        }
      } catch {
        /* ignore trailing */
      }
    }

    if (myRun === runId && !signal.aborted && desiredPlaying && !suspended) {
      setStatus({
        phase: status.framesScheduled > 0 ? "idle" : "error",
        error: status.error ?? (status.framesScheduled === 0 ? "streamEndedWithoutFrames" : null),
      })
      if (desiredPlaying && status.url) {
        window.setTimeout(() => {
          if (desiredPlaying && !suspended && status.url) void connect(status.url)
        }, 1200)
      }
    }
  } catch (err) {
    if (myRun === runId && !signal.aborted) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ phase: "error", error: message })
      callbacks.onError?.(message)
    }
  } finally {
    if (decoder === dec) {
      try {
        await dec.free()
      } catch {
        /* ignore */
      }
      decoder = null
    }
  }
}

async function connect(url: string): Promise<void> {
  const ctx = ensureRadioAudioContext()
  if (!ctx) {
    setStatus({ phase: "error", error: "noAudioContext" })
    return
  }
  resumeRadioAudioContext()
  ensureGraph(ctx)

  stopFetchOnly()
  const myRun = ++runId
  const controller = new AbortController()
  abort = controller
  loadedNotified = false
  playNotified = false
  outputGateOpen = false
  softStartPending = true
  awaitingFirstSchedule = true
  startNotifyScheduled = false
  trimConnectBurst = true
  needsFrameSync = true
  softStartSamplesLeft = 0
  softStartSamplesTotal = 0
  prerollSamplesLeft = 0
  setStatus({
    phase: "connecting",
    url,
    contentType: null,
    httpStatus: null,
    error: null,
    framesScheduled: 0,
  })

  try {
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
    let response: Response
    try {
      response = await fetchWithConnectTimeout(url, controller.signal, CONNECT_TIMEOUT_MS)
    } catch (err) {
      if (controller.signal.aborted || myRun !== runId) return
      const name = err instanceof Error ? err.name : ""
      const message = err instanceof Error ? err.message : String(err)
      const error =
        name === "AbortError" || /abort/i.test(message)
          ? `connectTimeout ${CONNECT_TIMEOUT_MS}ms`
          : message
      setStatus({ phase: "error", error })
      callbacks.onError?.(error)
      return
    }
    if (myRun !== runId) return

    const contentType = response.headers.get("content-type")
    const icyHeader = response.headers.get("icy-metaint")
    const icyMetaInt = icyHeader ? Number(icyHeader) : 0
    setStatus({
      httpStatus: response.status,
      contentType,
    })

    if (!response.ok) {
      const error = `http ${response.status}`
      setStatus({ phase: "error", error })
      callbacks.onError?.(error)
      return
    }
    if (!response.body) {
      setStatus({ phase: "error", error: "noResponseBody" })
      callbacks.onError?.("noResponseBody")
      return
    }
    if (!looksLikeMpeg(contentType, url)) {
      const error = `unsupportedContentType:${contentType ?? "unknown"}`
      setStatus({ phase: "error", error })
      callbacks.onError?.(error)
      return
    }

    void runDecodeLoop(
      myRun,
      response.body,
      Number.isFinite(icyMetaInt) ? icyMetaInt : 0,
      controller.signal,
      ctx,
    )
  } catch (err) {
    if (controller.signal.aborted || myRun !== runId) return
    const message = err instanceof Error ? err.message : String(err)
    setStatus({ phase: "error", error: message })
    callbacks.onError?.(message)
  }
}

function stopFetchOnly(): void {
  runId += 1
  abort?.abort()
  abort = null
  stopScheduledSources()
  const d = decoder
  decoder = null
  if (d) {
    void d.free().catch(() => {})
  }
  nextStartTime = 0
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
export function installRadioStreamPlayerAutoUnlock(): () => void {
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
export function primeRadioStreamPlayerFromGesture(): void {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return
  void ctx.resume()
  ensureGraph(ctx)
  unlockOutputFromGesture()
}

export type RadioStreamPlayerDebug = {
  phase: RadioStreamPlayerStatus["phase"]
  error: string | null
  contextState: string | null
  contextSampleRate: number | null
  currentTime: number | null
  nextStartTime: number
  bufferedAheadSec: number | null
  gainValue: number | null
  outputGateOpen: boolean
  outputUnlocked: boolean
  activeSources: number
  framesScheduled: number
  volume: number
  muted: boolean
  suspended: boolean
  playingDesired: boolean
  analyserConnected: boolean
}

/** Console diagnostics: `window.__radioAudioDebug?.()` in a room. */
export function getRadioStreamPlayerDebug(): RadioStreamPlayerDebug {
  const ctx = getExistingRadioAudioContext()
  const now = ctx?.currentTime ?? null
  return {
    phase: status.phase,
    error: status.error,
    contextState: ctx?.state ?? null,
    contextSampleRate: ctx?.sampleRate ?? null,
    currentTime: now,
    nextStartTime,
    bufferedAheadSec: now === null ? null : Math.max(0, nextStartTime - now),
    gainValue: gain?.gain.value ?? null,
    outputGateOpen,
    outputUnlocked,
    activeSources: activeSources.size,
    framesScheduled: status.framesScheduled,
    volume,
    muted,
    suspended,
    playingDesired: desiredPlaying,
    analyserConnected: Boolean(analyser),
  }
}

export function configureRadioStreamPlayer(next: PlayerCallbacks): void {
  callbacks = next
}

export function setRadioStreamPlayerVolume(next: number): void {
  volume = next
  applyGain()
}

export function setRadioStreamPlayerMuted(next: boolean): void {
  muted = next
  applyGain()
}

/**
 * Drive play/pause. Pause aborts the Icecast fetch; resume reconnects.
 * Output stays gated silent until the first clean PCM after connect.
 */
export function setRadioStreamPlayerPlaying(playing: boolean): void {
  desiredPlaying = playing
  status.playingDesired = playing

  if (!playing) {
    suspended = true
    status.suspended = true
    playNotified = false
    outputGateOpen = false
    softStartSamplesLeft = 0
    softStartSamplesTotal = 0
    prerollSamplesLeft = 0
    playbackEpoch += 1
    // Mute first, then tear down sources + fetch — never leave a half-decoded stream warm.
    applyGain()
    stopScheduledSources()
    stopFetchOnly()
    setStatus({
      phase: "idle",
      error: null,
    })
    return
  }

  suspended = false
  status.suspended = false
  outputGateOpen = false
  const ctx = ensureRadioAudioContext()
  if (ctx) {
    void ctx.resume()
    ensureGraph(ctx)
  }
  applyGain()

  const url = status.url
  if (!url) {
    notifyStatus()
    return
  }

  void connect(url)
}

export function setRadioStreamPlayerUrl(url: string): void {
  if (status.url === url && abort && !abort.signal.aborted) {
    if (desiredPlaying) setRadioStreamPlayerPlaying(true)
    return
  }
  status.url = url
  stopFetchOnly()
  setStatus({
    phase: "idle",
    url,
    contentType: null,
    httpStatus: null,
    error: null,
    framesScheduled: 0,
  })
  if (desiredPlaying && url) {
    void connect(url)
  }
}

export function stopRadioStreamPlayer(): void {
  desiredPlaying = false
  suspended = true
  playbackEpoch += 1
  outputGateOpen = false
  stopFetchOnly()
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
  callbacks = {}
  setStatus({
    phase: "idle",
    url: null,
    contentType: null,
    httpStatus: null,
    error: null,
    framesScheduled: 0,
    suspended: true,
    playingDesired: false,
  })
}

/** Test helper */
export function __resetRadioStreamPlayerForTests(): void {
  stopRadioStreamPlayer()
}
