/**
 * Shared analyser access for radio / hybrid listen (ADR 0136 / 0137).
 *
 * Radio rooms use `radioStreamPlayer` (one fetch → decode → gain + analyser).
 * Live / hybrid may still register an HTMLAudioElement and wire captureStream
 * or MediaElementSource on Chromium.
 */

type TapListener = () => void

let registeredElement: HTMLAudioElement | null = null
let streamAnalyser: AnalyserNode | null = null
const listeners = new Set<TapListener>()

let audioContext: AudioContext | null = null
let mediaStreamSource: MediaStreamAudioSourceNode | null = null
let mediaElementSource: MediaElementAudioSourceNode | null = null
let elementAnalyser: AnalyserNode | null = null
let wiredElement: HTMLAudioElement | null = null
let usedCaptureStream = false
let captureAbandoned = false

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeRadioAudioTap(listener: TapListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRegisteredRadioAudioElement(): HTMLAudioElement | null {
  return registeredElement
}

type AudioContextCtor = typeof AudioContext

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function isSafariLikeBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  if (/chrome|crios|chromium|android|edg/i.test(ua)) return false
  return /safari/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)
}

export function ensureRadioAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const Ctor = getAudioContextConstructor()
  if (!Ctor) return null
  audioContext = new Ctor()
  return audioContext
}

/**
 * Context if one already exists. Use this on teardown/idle paths — creating a
 * context outside a user gesture leaves WebKit output locked.
 */
export function getExistingRadioAudioContext(): AudioContext | null {
  return audioContext
}

export function resumeRadioAudioContext(): void {
  if (audioContext?.state === "suspended") {
    void audioContext.resume()
  }
}

/**
 * Radio stream player registers its AnalyserNode (audible graph already wired).
 */
export function registerRadioStreamAnalyser(node: AnalyserNode | null): void {
  if (streamAnalyser === node) return
  streamAnalyser = node
  notify()
}

/**
 * Live / hybrid register the active listen element.
 */
export function registerRadioAudioElement(element: HTMLAudioElement | null): void {
  if (element === registeredElement) return
  registeredElement = element
  notify()
}

function getCaptureStreamFn(
  el: HTMLMediaElement,
): (() => MediaStream) | null {
  const anyEl = el as HTMLMediaElement & {
    captureStream?: () => MediaStream
    webkitCaptureStream?: () => MediaStream
  }
  if (typeof anyEl.captureStream === "function") {
    return anyEl.captureStream.bind(anyEl)
  }
  if (typeof anyEl.webkitCaptureStream === "function") {
    return anyEl.webkitCaptureStream.bind(anyEl)
  }
  return null
}

function disconnectStreamSource(): void {
  try {
    mediaStreamSource?.disconnect()
  } catch {
    /* ignore */
  }
  mediaStreamSource = null
}

function ensureElementAnalyser(ctx: AudioContext): AnalyserNode {
  if (!elementAnalyser) {
    elementAnalyser = ctx.createAnalyser()
    elementAnalyser.fftSize = 256
    elementAnalyser.smoothingTimeConstant = 0.75
  }
  return elementAnalyser
}

function wireCaptureStream(el: HTMLAudioElement, ctx: AudioContext): boolean {
  if (captureAbandoned || el.paused || mediaElementSource) return false
  const capture = getCaptureStreamFn(el)
  if (!capture) return false
  try {
    disconnectStreamSource()
    const stream = capture()
    if (stream.getAudioTracks().length === 0) return false
    const source = ctx.createMediaStreamSource(stream)
    const node = ensureElementAnalyser(ctx)
    source.connect(node)
    mediaStreamSource = source
    wiredElement = el
    usedCaptureStream = true
    return true
  } catch {
    disconnectStreamSource()
    return false
  }
}

function wireMediaElementSource(el: HTMLAudioElement, ctx: AudioContext): boolean {
  if (isSafariLikeBrowser()) return false
  if (mediaElementSource) return wiredElement === el
  try {
    disconnectStreamSource()
    const source = ctx.createMediaElementSource(el)
    const node = ensureElementAnalyser(ctx)
    source.connect(node)
    node.connect(ctx.destination)
    mediaElementSource = source
    wiredElement = el
    usedCaptureStream = false
    return true
  } catch {
    return false
  }
}

export function analyserLooksSilent(node: AnalyserNode, minPeak = 2): boolean {
  const buf = new Uint8Array(node.fftSize)
  node.getByteTimeDomainData(buf)
  return byteTimeDomainLooksSilent(buf, minPeak)
}

export function byteTimeDomainLooksSilent(
  buf: Uint8Array,
  minPeak = 2,
): boolean {
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const d = Math.abs((buf[i] ?? 128) - 128)
    if (d > peak) peak = d
  }
  return peak < minPeak
}

export function fillRadioTimeDomainData(out: Uint8Array): boolean {
  const node = streamAnalyser ?? elementAnalyser
  if (!node) return false
  if (out.length !== node.fftSize) {
    const tmp = new Uint8Array(node.fftSize)
    node.getByteTimeDomainData(tmp)
    const n = Math.min(out.length, tmp.length)
    out.set(tmp.subarray(0, n))
    if (n < out.length) out.fill(128, n)
  } else {
    node.getByteTimeDomainData(out)
  }
  return true
}

export function fallbackRadioAudioTapToMediaElement(): boolean {
  if (streamAnalyser || isSafariLikeBrowser()) return false
  const el = registeredElement
  if (!el || mediaElementSource) return Boolean(mediaElementSource)
  const ctx = ensureRadioAudioContext()
  if (!ctx) return false
  captureAbandoned = true
  usedCaptureStream = false
  disconnectStreamSource()
  return wireMediaElementSource(el, ctx)
}

export function recoverRadioAudioTapFromSilence(silentFrames: number): void {
  if (streamAnalyser) return
  if (silentFrames > 0 && silentFrames % 30 === 0) {
    void rebindRadioAudioTap()
  }
  if (silentFrames >= 90) {
    fallbackRadioAudioTapToMediaElement()
  }
}

export async function getRadioAnalyser(): Promise<AnalyserNode | null> {
  if (streamAnalyser) return streamAnalyser

  const el = registeredElement
  if (!el) return null
  const ctx = ensureRadioAudioContext()
  if (!ctx) return null
  resumeRadioAudioContext()
  if (ctx.state === "suspended") {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }

  ensureElementAnalyser(ctx)
  if (wiredElement === el && (mediaStreamSource || mediaElementSource)) {
    return elementAnalyser
  }
  if (wireCaptureStream(el, ctx)) return elementAnalyser
  if (!getCaptureStreamFn(el) || captureAbandoned || el.paused) {
    wireMediaElementSource(el, ctx)
  }
  return elementAnalyser
}

export async function rebindRadioAudioTap(): Promise<AnalyserNode | null> {
  if (streamAnalyser) return streamAnalyser
  const el = registeredElement
  if (!el || el.paused) return elementAnalyser
  if (mediaElementSource && !usedCaptureStream) return elementAnalyser
  if (captureAbandoned) return elementAnalyser
  const ctx = ensureRadioAudioContext()
  if (!ctx) return null
  resumeRadioAudioContext()
  if (!getCaptureStreamFn(el)) return elementAnalyser
  wireCaptureStream(el, ctx)
  return elementAnalyser
}

/** @deprecated Prefer primeRadioStreamPlayerFromGesture for radio. */
export function primeRadioAudioTapFromGesture(): void {
  const ctx = ensureRadioAudioContext()
  if (!ctx) return
  resumeRadioAudioContext()
}

export type RadioAudioTapDebugSnapshot = {
  safariLike: boolean
  path: "streamPlayer" | "captureStream" | "mediaElementSource" | "none"
  hasStreamAnalyser: boolean
  hasRegisteredElement: boolean
  audioContextState: string | null
  analyserPeak: number | null
  analyserSilent: boolean | null
}

export function getRadioAudioTapDebugSnapshot(): RadioAudioTapDebugSnapshot {
  const node = streamAnalyser ?? elementAnalyser
  let analyserPeak: number | null = null
  let analyserSilent: boolean | null = null
  if (node) {
    const buf = new Uint8Array(node.fftSize)
    node.getByteTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) {
      peak = Math.max(peak, Math.abs((buf[i] ?? 128) - 128))
    }
    analyserPeak = peak
    analyserSilent = peak < 2
  }

  const path: RadioAudioTapDebugSnapshot["path"] = streamAnalyser
    ? "streamPlayer"
    : mediaElementSource
      ? "mediaElementSource"
      : mediaStreamSource
        ? "captureStream"
        : "none"

  return {
    safariLike: isSafariLikeBrowser(),
    path,
    hasStreamAnalyser: Boolean(streamAnalyser),
    hasRegisteredElement: Boolean(registeredElement),
    audioContextState: audioContext?.state ?? null,
    analyserPeak,
    analyserSilent,
  }
}

export function __resetRadioAudioTapForTests(): void {
  registeredElement = null
  streamAnalyser = null
  listeners.clear()
  disconnectStreamSource()
  try {
    mediaElementSource?.disconnect()
  } catch {
    /* ignore */
  }
  try {
    elementAnalyser?.disconnect()
  } catch {
    /* ignore */
  }
  mediaElementSource = null
  elementAnalyser = null
  wiredElement = null
  usedCaptureStream = false
  captureAbandoned = false
  if (audioContext) {
    void audioContext.close().catch(() => {})
    audioContext = null
  }
}
