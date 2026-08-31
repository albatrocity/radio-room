/**
 * Shared analyser access for room listen visuals (ADR 0136 / 0137 / 0139).
 *
 * Radio owns the audible graph in `radioStreamEngine` and registers its
 * AnalyserNode here, so consumers read time-domain data without touching the
 * audio path. The AudioContext is a singleton because WebKit locks output for
 * contexts created outside a user gesture — create it from the play gesture.
 *
 * Live / hybrid register their listen element for a future visualisation; the
 * Chromium `captureStream` / `MediaElementSource` wiring that radio needed
 * before ADR 0137 is gone. A live scope would register its own analyser here.
 */

type TapListener = () => void

let registeredElement: HTMLAudioElement | null = null
let streamAnalyser: AnalyserNode | null = null
const listeners = new Set<TapListener>()

let audioContext: AudioContext | null = null

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
  const w = window as Window & {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
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

/** The audible graph registers its analyser (radio: `radioStreamEngine`). */
export function registerRadioStreamAnalyser(node: AnalyserNode | null): void {
  if (streamAnalyser === node) return
  streamAnalyser = node
  notify()
}

export function getRadioStreamAnalyser(): AnalyserNode | null {
  return streamAnalyser
}

/** Live / hybrid register the active listen element. */
export function registerRadioAudioElement(element: HTMLAudioElement | null): void {
  if (element === registeredElement) return
  registeredElement = element
  notify()
}

export function byteTimeDomainLooksSilent(buf: Uint8Array, minPeak = 2): boolean {
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const d = Math.abs((buf[i] ?? 128) - 128)
    if (d > peak) peak = d
  }
  return peak < minPeak
}

export function fillRadioTimeDomainData(out: Uint8Array<ArrayBuffer>): boolean {
  const node = streamAnalyser
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

export type RadioAudioTapDebugSnapshot = {
  safariLike: boolean
  hasStreamAnalyser: boolean
  hasRegisteredElement: boolean
  audioContextState: string | null
  analyserPeak: number | null
  analyserSilent: boolean | null
}

export function getRadioAudioTapDebugSnapshot(): RadioAudioTapDebugSnapshot {
  let analyserPeak: number | null = null
  let analyserSilent: boolean | null = null
  if (streamAnalyser) {
    const buf = new Uint8Array(streamAnalyser.fftSize)
    streamAnalyser.getByteTimeDomainData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) {
      peak = Math.max(peak, Math.abs((buf[i] ?? 128) - 128))
    }
    analyserPeak = peak
    analyserSilent = peak < 2
  }

  return {
    safariLike: isSafariLikeBrowser(),
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
  if (audioContext) {
    void audioContext.close().catch(() => {})
    audioContext = null
  }
}
