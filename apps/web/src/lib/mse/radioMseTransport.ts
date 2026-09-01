/**
 * MSE-backed radio playback transport (Phase 1).
 *
 * Feeds MP3 frames to a MediaSource-backed `<audio>` element. Falls back to
 * `radioPlaybackElement` when disabled, unsupported, or rejected by the machine.
 */

import { AppendQueue } from "./appendQueue"
import { splitMpegFrames, type MpegFrame } from "./mpegFrames"
import { isAnalysisTapActive, submitFrames } from "./analysisTap"
import { getMediaSourceCtor, isManagedMediaSource, mseRadioSupported, supportedRadioMimeType } from "./mediaSourceSupport"
import { radioMseEnabled } from "./radioMseEnabled"

const RECONNECT_BACKOFF_MS = 1200
/** Recent append batches replayed when the oscilloscope mounts mid-stream. */
const FRAME_CACHE_SEC = 60
/**
 * Seek toward the live edge after the connect burst. `0` = off (default).
 * Enable at build: `VITE_RADIO_MSE_LIVE_EDGE_SEC=0.5`
 */
const LIVE_EDGE_MARGIN_SEC = (() => {
  const raw = import.meta.env.VITE_RADIO_MSE_LIVE_EDGE_SEC
  if (raw === undefined || raw === "") return 0
  const parsed = Number.parseFloat(String(raw))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
})()

type CachedFrameBatch = {
  frames: MpegFrame[]
  startTimeSec: number
  endTimeSec: number
}

let recentFrameBatches: CachedFrameBatch[] = []

function rememberFrameBatch(frames: MpegFrame[], startTimeSec: number): void {
  if (frames.length === 0) return
  const durationSec = frames.reduce((sum, frame) => sum + frame.durationSec, 0)
  const endTimeSec = startTimeSec + durationSec
  recentFrameBatches.push({ frames, startTimeSec, endTimeSec })
  const cutoff = endTimeSec - FRAME_CACHE_SEC
  while (recentFrameBatches.length > 0 && recentFrameBatches[0]!.endTimeSec < cutoff) {
    recentFrameBatches.shift()
  }
}

/** Replay cached append batches after the oscilloscope mounts mid-stream. */
export function backfillRadioMseAnalysisTap(): void {
  if (!isAnalysisTapActive()) return
  for (const batch of recentFrameBatches) {
    submitFrames(batch.frames, batch.startTimeSec)
  }
}

type MseSession = {
  url: string
  mime: string
  source: MediaSource
  objectUrl: string | null
  abort: AbortController
  queue: AppendQueue | null
  sb: SourceBuffer | null
  reader: ReadableStreamDefaultReader<Uint8Array> | null
  remainder: Uint8Array<ArrayBuffer>
  streamingAllowed: boolean
  stopped: boolean
  reachedPlaying: boolean
  appendedSec: number
  bytesAppended: number
  framesAppended: number
  startStreamingCount: number
  endStreamingCount: number
  lastEndStreamingAt: number
  liveEdgeSeekDone: boolean
  onFallbackBeforePlaying: (() => void) | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

let element: HTMLAudioElement | null = null
let volume = 1
let muted = false
let volumeSettable: boolean | null = null
let session: MseSession | null = null

export type RadioMseStartOptions = {
  /** Invoked once when setup fails before the element reaches `playing`. */
  onFallbackBeforePlaying?: () => void
}

function concatBytes(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  if (a.length === 0) return b
  const out = new Uint8Array(a.length + b.length) as Uint8Array<ArrayBuffer>
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function applyLevels(): void {
  if (!element) return
  element.muted = muted
  if (volumeIsSettable()) element.volume = Math.max(0, Math.min(1, volume))
}

function volumeIsSettable(): boolean {
  if (volumeSettable !== null) return volumeSettable
  if (!element) return true
  const prior = element.volume
  element.volume = 0.5
  volumeSettable = element.volume !== 1
  element.volume = prior
  return volumeSettable
}

function teardownSession(): void {
  if (!session) return
  session.stopped = true
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer)
  session.abort.abort()
  session.reader?.cancel().catch(() => {})
  session.queue?.clear()
  if (session.sb) {
    try {
      if (session.sb.updating) session.sb.abort()
    } catch {
      /* ignore */
    }
  }
  if (session.source.readyState === "open") {
    try {
      session.source.endOfStream()
    } catch {
      /* ignore */
    }
  }
  if (session.objectUrl) URL.revokeObjectURL(session.objectUrl)
  session = null
  recentFrameBatches = []
}

function triggerFallbackBeforePlaying(): void {
  if (!session || session.reachedPlaying || session.stopped) return
  const cb = session.onFallbackBeforePlaying
  session.onFallbackBeforePlaying = null
  cb?.()
}

function maybeEvict(): void {
  if (!session?.sb || !element) return
  const sb = session.sb
  if (sb.updating || sb.buffered.length === 0) return
  const start = sb.buffered.start(0)
  const end = sb.buffered.end(sb.buffered.length - 1)
  const keepBehind = element.currentTime - 60
  if (keepBehind > start + 5) {
    session.queue?.remove(start, element.currentTime - 30)
  } else if (end - element.currentTime > 120) {
    session.queue?.remove(start, element.currentTime - 30)
  }
}

function maybeSeekToLiveEdge(): void {
  if (LIVE_EDGE_MARGIN_SEC <= 0 || !session?.sb || !element || session.liveEdgeSeekDone) return
  const sb = session.sb
  if (sb.buffered.length === 0) return
  const end = sb.buffered.end(sb.buffered.length - 1)
  const target = end - LIVE_EDGE_MARGIN_SEC
  if (target > element.currentTime + 0.5) {
    try {
      element.currentTime = target
      session.liveEdgeSeekDone = true
    } catch {
      /* ignore — buffer may not be seekable yet */
    }
  }
}

function bufferAheadSec(): number | null {
  if (!session?.sb || !element || session.sb.buffered.length === 0) return null
  const end = session.sb.buffered.end(session.sb.buffered.length - 1)
  return Math.max(0, end - element.currentTime)
}

function appendFrames(frames: MpegFrame[]): void {
  if (!session?.queue) return
  const startTimeSec = session.appendedSec
  rememberFrameBatch(frames, startTimeSec)
  if (isAnalysisTapActive()) submitFrames(frames, startTimeSec)
  for (const frame of frames) {
    session.appendedSec += frame.durationSec
    session.queue.append(frame.bytes)
    session.bytesAppended += frame.bytes.byteLength
    session.framesAppended += 1
  }
  maybeSeekToLiveEdge()
}

async function pumpStream(): Promise<void> {
  if (!session || session.stopped) return

  let response: Response
  try {
    response = await fetch(session.url, {
      signal: session.abort.signal,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    })
  } catch {
    triggerFallbackBeforePlaying()
    return
  }

  if (!response.ok || !response.body) {
    triggerFallbackBeforePlaying()
    return
  }

  const reader = response.body.getReader()
  session.reader = reader

  while (!session.stopped) {
    if (isManagedMediaSource() && !session.streamingAllowed) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      continue
    }

    let chunk: Uint8Array<ArrayBuffer>
    try {
      const result = await reader.read()
      if (result.done) break
      chunk = result.value as Uint8Array<ArrayBuffer>
    } catch {
      if (session.stopped) return
      break
    }

    if (!session.queue) continue

    const combined = concatBytes(session.remainder, chunk)
    const { frames, remainder } = splitMpegFrames(combined)
    session.remainder = remainder
    appendFrames(frames)
    maybeEvict()
  }

  if (session.stopped) return

  session.reconnectTimer = setTimeout(() => {
    if (!session || session.stopped) return
    session.abort = new AbortController()
    session.reader = null
    session.remainder = new Uint8Array(0) as Uint8Array<ArrayBuffer>
    void pumpStream()
  }, RECONNECT_BACKOFF_MS)
}

export function ensureRadioMseElement(): HTMLAudioElement | null {
  if (element) return element
  if (typeof document === "undefined") return null
  const el = document.createElement("audio")
  el.preload = "none"
  el.autoplay = false
  el.disableRemotePlayback = true
  el.style.display = "none"
  document.body.appendChild(el)
  element = el
  applyLevels()
  return el
}

export function getRadioMseElement(): HTMLAudioElement | null {
  return element
}

export function radioMseVolumeIsSettable(): boolean {
  ensureRadioMseElement()
  return volumeIsSettable()
}

/** Presentation timeline position of the next frame batch (Phase 2). */
export function getRadioMseAppendedSec(): number {
  return session?.appendedSec ?? 0
}

export function startRadioMseStream(url: string, options: RadioMseStartOptions = {}): void {
  const Ctor = getMediaSourceCtor()
  const mime = supportedRadioMimeType()
  const el = ensureRadioMseElement()
  if (!Ctor || !mime || !el) {
    options.onFallbackBeforePlaying?.()
    return
  }

  if (session && session.url === url && !session.stopped) {
    session.onFallbackBeforePlaying = options.onFallbackBeforePlaying ?? null
    return
  }

  teardownSession()
  releaseRadioMse()

  const source = new Ctor()
  const objectUrl = URL.createObjectURL(source)
  el.src = objectUrl

  const abort = new AbortController()
  session = {
    url,
    mime,
    source,
    objectUrl,
    abort,
    queue: null,
    sb: null,
    reader: null,
    remainder: new Uint8Array(0) as Uint8Array<ArrayBuffer>,
    streamingAllowed: true,
    stopped: false,
    reachedPlaying: false,
    appendedSec: 0,
    bytesAppended: 0,
    framesAppended: 0,
    startStreamingCount: 0,
    endStreamingCount: 0,
    lastEndStreamingAt: 0,
    liveEdgeSeekDone: false,
    onFallbackBeforePlaying: options.onFallbackBeforePlaying ?? null,
    reconnectTimer: null,
  }

  source.addEventListener("sourceopen", () => {
    if (!session || session.stopped) return
    if (session.objectUrl) {
      URL.revokeObjectURL(session.objectUrl)
      session.objectUrl = null
    }

    try {
      source.duration = Infinity
    } catch {
      /* ignore */
    }

    let sb: SourceBuffer
    try {
      sb = source.addSourceBuffer(session.mime)
    } catch {
      triggerFallbackBeforePlaying()
      return
    }

    sb.mode = "sequence"
    session.sb = sb
    session.queue = new AppendQueue(sb, (message) => {
      if (message === "quotaExceeded" && element && sb.buffered.length > 0) {
        const start = sb.buffered.start(0)
        session.queue?.remove(start, element.currentTime - 30)
        return
      }
      if (!session?.reachedPlaying) triggerFallbackBeforePlaying()
    })

    sb.addEventListener("bufferedchange", () => maybeEvict())

    void pumpStream()
  })

  source.addEventListener("error", () => {
    if (!session?.reachedPlaying) triggerFallbackBeforePlaying()
  })

  if (isManagedMediaSource()) {
    source.addEventListener("startstreaming", () => {
      if (!session) return
      session.startStreamingCount += 1
      session.streamingAllowed = true
    })
    source.addEventListener("endstreaming", () => {
      if (!session) return
      session.endStreamingCount += 1
      session.lastEndStreamingAt = Date.now()
      session.streamingAllowed = false
    })
  }
}

/** Mark that audible playback has started — suppresses pre-play fallback. */
export function markRadioMsePlaying(): void {
  if (session) {
    session.reachedPlaying = true
    session.onFallbackBeforePlaying = null
    maybeSeekToLiveEdge()
  }
}

export function playRadioMse(): void {
  const el = ensureRadioMseElement()
  if (!el || !el.src) return
  try {
    const started = el.play() as Promise<void> | undefined
    started?.catch(() => {})
  } catch {
    /* ignore */
  }
}

export function releaseRadioMse(): void {
  teardownSession()
  if (!element) return
  try {
    element.pause()
    element.removeAttribute("src")
    element.load()
  } catch {
    /* ignore */
  }
}

export function setRadioMseVolume(next: number): void {
  volume = next
  applyLevels()
}

export function setRadioMseMuted(next: boolean): void {
  muted = next
  applyLevels()
}

export function teardownRadioMseElement(): void {
  releaseRadioMse()
  if (!element) return
  try {
    element.remove()
  } catch {
    /* ignore */
  }
  element = null
  volumeSettable = null
}

export type RadioMseDebug = {
  hasElement: boolean
  hasSession: boolean
  mime: string | null
  isManaged: boolean
  paused: boolean | null
  readyState: number | null
  currentTime: number | null
  appendedSec: number
  bytesAppended: number
  framesAppended: number
  streamingAllowed: boolean | null
  startStreamingCount: number
  endStreamingCount: number
  /** Seconds of buffered audio ahead of `currentTime` (for latency tuning). */
  bufferAheadSec: number | null
  volume: number
  muted: boolean
  volumeSettable: boolean
}

export function getRadioMseDebug(): RadioMseDebug {
  return {
    hasElement: Boolean(element),
    hasSession: Boolean(session),
    mime: session?.mime ?? supportedRadioMimeType(),
    isManaged: isManagedMediaSource(),
    paused: element?.paused ?? null,
    readyState: element?.readyState ?? null,
    currentTime: element?.currentTime ?? null,
    appendedSec: session?.appendedSec ?? 0,
    bytesAppended: session?.bytesAppended ?? 0,
    framesAppended: session?.framesAppended ?? 0,
    streamingAllowed: session?.streamingAllowed ?? null,
    startStreamingCount: session?.startStreamingCount ?? 0,
    endStreamingCount: session?.endStreamingCount ?? 0,
    bufferAheadSec: bufferAheadSec(),
    volume,
    muted,
    volumeSettable: volumeSettable ?? true,
  }
}

/** Whether MSE should be attempted for this session. */
export function useMseRadioTransport(mseRejected: boolean): boolean {
  return !mseRejected && radioMseEnabled() && mseRadioSupported()
}
