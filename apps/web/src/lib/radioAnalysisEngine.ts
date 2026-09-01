/**
 * Silent analysis decode for the oscilloscope (ADR 0140).
 *
 * A second, inaudible connection to the station: CORS fetch → MPEG decode →
 * `AnalyserNode`. The analyser's output is deliberately left unconnected — per
 * MDN it still produces data that way — so this path can never make sound or
 * interfere with the `<audio>` element that owns playback.
 *
 * Because it is silent, this code is allowed to be imprecise. Everything the
 * ADR 0138 pipeline needed to sound acceptable (gain gating, soft start, PCM
 * preroll, pathological-PCM rejection, underrun rebuffering, WebKit output
 * unlock) is gone: a dropped buffer here is a flicker in a waveform.
 *
 * Lifecycle — including the visibility/scope gating that keeps this connection
 * closed when nobody is watching — belongs to `radioStreamMachine`.
 */

import { MPEGDecoderWebWorker } from "mpg123-decoder"
import {
  registerRadioStreamAnalyser,
  ensureRadioAudioContext,
  getExistingRadioAudioContext,
} from "./radioAudioTap"

const CONNECT_TIMEOUT_MS = 10_000
/** Keep our own lag small and known; `alignmentDelay` supplies the rest. */
const START_BUFFER_SEC = 0.3
/**
 * Re-anchor to the live edge once scheduling runs this far ahead.
 *
 * We must never throttle reads to stay level with the stream: waiting would
 * park the backlog in the fetch buffer, where `nextStartTime` cannot see it,
 * and the alignment servo would then believe a lag of this size while actually
 * trailing live by a whole connect burst. Read greedily and drop instead, so
 * scheduling depth is the *whole* of this path's lag. In steady state audio
 * arrives at 1x and nothing is ever dropped.
 */
const MAX_SCOPE_BACKLOG_SEC = 0.75
/** Coalesce a little network data before a worker decode round-trip. */
const MIN_DECODE_BYTES = 4 * 1024

/**
 * Scope alignment (ADR 0140).
 *
 * This connection and the `<audio>` element both read the live edge at 1x, so
 * each one's lag behind the bytes it has received is its lag behind the other.
 * We discard backlog to stay ~0.3s back (see `MAX_SCOPE_BACKLOG_SEC`); the
 * element plays the connect burst it was handed and so sits a whole burst
 * further back — Shoutcast's adaptive buffer defaults to 5s, Icecast bursts
 * 64KB, roughly 4s at 128kbps. That difference is the offset, and both halves
 * are measurable: the element reports `buffered.end - currentTime`, and our own
 * scheduling depth is the whole of our lag *provided we never throttle reads*.
 * A `DelayNode` in front of the analyser makes up the difference, re-measured
 * as buffers shift, so the trace lands on what is heard rather than on live.
 */
const ALIGNMENT_MAX_DELAY_SEC = 12
const ALIGNMENT_SAMPLE_MS = 1_000
/** Below this the correction is not worth the visible warp of a delay change. */
const ALIGNMENT_DEADBAND_SEC = 0.15
const ALIGNMENT_RAMP_SEC = 0.4

export type RadioAnalysisRunCallbacks = {
  onConnected: (info: { httpStatus: number; contentType: string | null }) => void
  onStreaming: () => void
  onEnded: (info: { framesScheduled: number }) => void
  onError: (message: string) => void
}

export type RadioAnalysisRun = {
  stop: () => void
  framesScheduled: () => number
  bufferedAheadSec: () => number | null
  activeSourceCount: () => number
}

export type RadioAnalysisRunOptions = {
  /**
   * How far the audible element's playhead trails the bytes it has received.
   * Injected rather than imported so the analysis path keeps no dependency on
   * the playback path (ADR 0140).
   */
  elementLagSec?: () => number | null
}

let analyser: AnalyserNode | null = null
let alignmentDelay: DelayNode | null = null
/** Current run, for diagnostics only. */
let currentRun: RadioAnalysisRun | null = null

export function ensureRadioAnalysisGraph(): AnalyserNode | null {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return null
  if (!analyser) {
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    // Low smoothing so the scope tracks transients rather than averaging them.
    analyser.smoothingTimeConstant = 0.35
  }
  if (!alignmentDelay) {
    alignmentDelay = ctx.createDelay(ALIGNMENT_MAX_DELAY_SEC)
    alignmentDelay.connect(analyser)
  }
  registerRadioStreamAnalyser(analyser)
  return analyser
}

/** Sources feed the delay, never the analyser directly. */
function ensureAnalysisInput(): AudioNode | null {
  if (!ensureRadioAnalysisGraph()) return null
  return alignmentDelay
}

function applyAlignmentDelay(ctx: AudioContext, seconds: number): void {
  const param = alignmentDelay?.delayTime
  if (!param) return
  const target = Math.min(Math.max(seconds, 0), ALIGNMENT_MAX_DELAY_SEC - 0.5)
  if (Math.abs(param.value - target) < ALIGNMENT_DEADBAND_SEC) return
  try {
    param.cancelScheduledValues(ctx.currentTime)
    param.setValueAtTime(param.value, ctx.currentTime)
    param.linearRampToValueAtTime(target, ctx.currentTime + ALIGNMENT_RAMP_SEC)
  } catch {
    param.value = target
  }
}

export function teardownRadioAnalysisGraph(): void {
  registerRadioStreamAnalyser(null)
  try {
    alignmentDelay?.disconnect()
  } catch {
    /* ignore */
  }
  try {
    analyser?.disconnect()
  } catch {
    /* ignore */
  }
  alignmentDelay = null
  analyser = null
}

/**
 * WebKit will not start a context created outside a user gesture, and a
 * suspended context renders nothing — so the analyser would flatline. Resuming
 * from the play gesture is all this needs; the silent-buffer unlock ADR 0138
 * required is gone with the audible path.
 */
export function resumeRadioAnalysisFromGesture(): void {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return
  void ctx.resume()
}

function findMpegFrameSync(buf: Uint8Array): number {
  for (let i = 0; i < buf.length - 1; i++) {
    // MPEG frame sync: 11 set bits.
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) return i
  }
  return -1
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
 * Start one analysis connection. All per-connection state is local, so a
 * stopped run cannot keep feeding the analyser.
 */
export function startRadioAnalysisRun(
  url: string,
  cb: RadioAnalysisRunCallbacks,
  options: RadioAnalysisRunOptions = {},
): RadioAnalysisRun {
  const controller = new AbortController()
  const signal = controller.signal
  let stopped = false
  let decoder: MPEGDecoderWebWorker | null = null
  let nextStartTime = 0
  let framesScheduled = 0
  const activeSources = new Set<AudioBufferSourceNode>()

  /** Only needed to enter the bitstream — the decoder keeps partial frames. */
  let needsFrameSync = true
  let awaitingFirstSchedule = true

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

  function schedulePcm(
    ctx: AudioContext,
    channelData: Float32Array[],
    samples: number,
    sampleRate: number,
  ): void {
    if (stopped || samples <= 0 || channelData.length === 0) return

    const node = ensureAnalysisInput()
    if (!node) return

    const now = ctx.currentTime
    // The connect burst lands as one large backlog. Throw it away rather than
    // playing through it, so this path tracks live and its lag stays knowable.
    if (!awaitingFirstSchedule && nextStartTime - now > MAX_SCOPE_BACKLOG_SEC) {
      stopScheduledSources()
      awaitingFirstSchedule = true
    }

    const buffer = ctx.createBuffer(channelData.length, samples, sampleRate)
    for (let c = 0; c < channelData.length; c++) {
      const src = channelData[c]
      if (!src) continue
      buffer.getChannelData(c).set(src.length === samples ? src : src.subarray(0, samples))
    }

    const srcNode = ctx.createBufferSource()
    srcNode.buffer = buffer
    srcNode.connect(node)
    srcNode.onended = () => {
      activeSources.delete(srcNode)
    }
    activeSources.add(srcNode)

    if (awaitingFirstSchedule) {
      awaitingFirstSchedule = false
      nextStartTime = now + START_BUFFER_SEC
    } else if (nextStartTime < now) {
      // Underrun. The trace flickers; nothing audible is at stake.
      nextStartTime = now
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

        schedulePcm(ctx, decoded.channelData, decoded.samplesDecoded, decoded.sampleRate)
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
    ensureRadioAnalysisGraph()

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

  /**
   * Both connections trail the live edge; the difference is what the eye sees.
   * Re-measured rather than set once, since either buffer can shift.
   */
  const alignmentTimer =
    typeof window === "undefined"
      ? null
      : window.setInterval(() => {
          if (stopped) return
          const ctx = getExistingRadioAudioContext()
          if (!ctx) return
          const elementLag = options.elementLagSec?.()
          if (elementLag == null) return
          const analysisLag = nextStartTime - ctx.currentTime
          // Nothing scheduled yet: our own lag is not knowable.
          if (analysisLag <= 0) return
          applyAlignmentDelay(ctx, elementLag - analysisLag)
        }, ALIGNMENT_SAMPLE_MS)

  const run: RadioAnalysisRun = {
    stop: () => {
      if (stopped) return
      stopped = true
      if (alignmentTimer !== null) window.clearInterval(alignmentTimer)
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

export type RadioAnalysisEngineDebug = {
  contextState: string | null
  contextSampleRate: number | null
  bufferedAheadSec: number | null
  activeSources: number
  framesScheduled: number
  analyserConnected: boolean
  alignmentDelaySec: number | null
}

export function getRadioAnalysisEngineDebug(): RadioAnalysisEngineDebug {
  const ctx = getExistingRadioAudioContext()
  return {
    contextState: ctx?.state ?? null,
    contextSampleRate: ctx?.sampleRate ?? null,
    bufferedAheadSec: currentRun?.bufferedAheadSec() ?? null,
    activeSources: currentRun?.activeSourceCount() ?? 0,
    framesScheduled: currentRun?.framesScheduled() ?? 0,
    analyserConnected: Boolean(analyser),
    alignmentDelaySec: alignmentDelay?.delayTime.value ?? null,
  }
}
