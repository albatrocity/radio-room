/**
 * Shared listen-visual hooks (ADR 0136 / MSE Phase 2).
 *
 * Live / hybrid rooms register their listen element for future visualisations.
 * Radio oscilloscope reads aligned PCM from `analysisTap` via the MSE element's
 * `currentTime` — no AnalyserNode or second connection.
 */

import { fillTimeDomainAt, getAnalysisTapDebug, isAnalysisTapActive } from "./mse/analysisTap"
import { getRadioMseElement } from "./mse/radioMseTransport"

type TapListener = () => void

let registeredElement: HTMLAudioElement | null = null
const listeners = new Set<TapListener>()

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

/** Live / hybrid register the active listen element. */
export function registerRadioAudioElement(element: HTMLAudioElement | null): void {
  if (element === registeredElement) return
  registeredElement = element
  notify()
}

export function isSafariLikeBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  if (/chrome|crios|chromium|android|edg/i.test(ua)) return false
  return /safari/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)
}

/** @deprecated LivePlayer resume helper — no AudioContext in the radio path. */
export function resumeRadioAudioContext(): void {}

export function byteTimeDomainLooksSilent(buf: Uint8Array, minPeak = 2): boolean {
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const d = Math.abs((buf[i] ?? 128) - 128)
    if (d > peak) peak = d
  }
  return peak < minPeak
}

export function fillRadioTimeDomainData(out: Uint8Array<ArrayBuffer>): boolean {
  if (!isAnalysisTapActive()) return false
  const el = getRadioMseElement()
  if (!el) return false
  return fillTimeDomainAt(el.currentTime, out)
}

export type RadioAudioTapDebugSnapshot = {
  safariLike: boolean
  hasRegisteredElement: boolean
  tapActive: boolean
  tapBufferedSec: number
}

export function getRadioAudioTapDebugSnapshot(): RadioAudioTapDebugSnapshot {
  const tap = getAnalysisTapDebug()
  return {
    safariLike: isSafariLikeBrowser(),
    hasRegisteredElement: Boolean(registeredElement),
    tapActive: tap.active,
    tapBufferedSec: tap.bufferedSec,
  }
}

export function __resetRadioAudioTapForTests(): void {
  registeredElement = null
  listeners.clear()
}
