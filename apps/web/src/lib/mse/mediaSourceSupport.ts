/**
 * Media Source capability probes for radio MSE transport.
 */

export type MediaSourceConstructor = typeof MediaSource

export function getMediaSourceCtor(): MediaSourceConstructor | null {
  if (typeof window === "undefined") return null
  const w = window as Window & {
    ManagedMediaSource?: MediaSourceConstructor
    MediaSource?: MediaSourceConstructor
  }
  if (w.ManagedMediaSource) return w.ManagedMediaSource
  if (w.MediaSource) return w.MediaSource
  return null
}

export function isManagedMediaSource(): boolean {
  if (typeof window === "undefined") return false
  return typeof (window as Window & { ManagedMediaSource?: unknown }).ManagedMediaSource !==
    "undefined"
}

/** First mime the platform will accept, or null. Probes mpeg before aac. */
export function supportedRadioMimeType(): string | null {
  const Ctor = getMediaSourceCtor()
  if (!Ctor) return null
  if (Ctor.isTypeSupported("audio/mpeg")) return "audio/mpeg"
  if (Ctor.isTypeSupported("audio/aac")) return "audio/aac"
  return null
}

export function mseRadioSupported(): boolean {
  return supportedRadioMimeType() !== null
}
