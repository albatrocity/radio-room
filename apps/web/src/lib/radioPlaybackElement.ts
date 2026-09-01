/**
 * Audible radio playback (ADR 0140).
 *
 * A plain `HTMLAudioElement` owns decode and output so playback survives an iOS
 * screen lock — routing it through an AudioContext, in any arrangement, does
 * not. Nothing here touches Web Audio; the oscilloscope's samples come from the
 * separate silent decode in `radioAnalysisEngine`.
 *
 * `crossOrigin` is deliberately unset: we never read samples from this element,
 * so stations without CORS headers still play.
 */

let element: HTMLAudioElement | null = null
let volume = 1
let muted = false
/** `HTMLMediaElement.volume` is inert on iOS; probed once, lazily. */
let volumeSettable: boolean | null = null

export function ensureRadioPlaybackElement(): HTMLAudioElement | null {
  if (element) return element
  if (typeof document === "undefined") return null
  const el = document.createElement("audio")
  el.preload = "none"
  el.autoplay = false
  el.style.display = "none"
  document.body.appendChild(el)
  element = el
  applyLevels()
  return el
}

export function getRadioPlaybackElement(): HTMLAudioElement | null {
  return element
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

/**
 * Whether a volume slider can do anything on this device. iOS reserves level to
 * the hardware buttons, so the control is hidden there rather than shown dead.
 */
export function radioPlaybackVolumeIsSettable(): boolean {
  ensureRadioPlaybackElement()
  return volumeIsSettable()
}

export function setRadioPlaybackUrl(url: string | null): void {
  const el = ensureRadioPlaybackElement()
  if (!el) return
  if (!url) {
    el.removeAttribute("src")
    el.load()
    return
  }
  if (el.getAttribute("src") === url) return
  el.src = url
}

/**
 * Must run inside the user-gesture turn on iOS. Safe to call repeatedly — an
 * element that is already playing ignores it.
 */
export function playRadioPlayback(): void {
  const el = ensureRadioPlaybackElement()
  if (!el || !el.getAttribute("src")) return
  try {
    // jsdom (and very old browsers) return undefined rather than a promise.
    const started = el.play() as Promise<void> | undefined
    started?.catch(() => {
      // Rejection surfaces through the element's `error` event, which the
      // machine already listens for.
    })
  } catch {
    /* ignore */
  }
}

/**
 * Pause *and* drop the source, so the next play is a fresh connection at the
 * live edge (ADR 0138 decisions 1–2, ADR 0140).
 *
 * Merely pausing keeps a buffer the station has already moved past; resuming
 * into it plays a discontinuous bitstream, which is the squeal/garble this
 * replaced. Live radio has nothing to resume into, so there is nothing to lose.
 */
export function releaseRadioPlayback(): void {
  if (!element) return
  try {
    element.pause()
    element.removeAttribute("src")
    element.load()
  } catch {
    /* ignore */
  }
}

export function setRadioPlaybackVolume(next: number): void {
  volume = next
  applyLevels()
}

/** Covers both user mute and preview ducking — iOS honours `muted`. */
export function setRadioPlaybackMuted(next: boolean): void {
  muted = next
  applyLevels()
}

export function teardownRadioPlaybackElement(): void {
  if (!element) return
  releaseRadioPlayback()
  try {
    element.remove()
  } catch {
    /* ignore */
  }
  element = null
}

export type RadioPlaybackDebug = {
  hasElement: boolean
  paused: boolean | null
  readyState: number | null
  networkState: number | null
  currentSrc: string | null
  elementBufferedAheadSec: number | null
  volume: number
  muted: boolean
  volumeSettable: boolean
}

export function getRadioPlaybackDebug(): RadioPlaybackDebug {
  let elementBufferedAheadSec: number | null = null
  if (element && element.buffered.length > 0) {
    const end = element.buffered.end(element.buffered.length - 1)
    elementBufferedAheadSec = Math.max(0, end - element.currentTime)
  }
  return {
    hasElement: Boolean(element),
    paused: element?.paused ?? null,
    readyState: element?.readyState ?? null,
    networkState: element?.networkState ?? null,
    currentSrc: element?.currentSrc || null,
    elementBufferedAheadSec,
    volume,
    muted,
    volumeSettable: volumeSettable ?? true,
  }
}
