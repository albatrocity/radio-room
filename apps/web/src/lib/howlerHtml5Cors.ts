/**
 * Ensure Howler HTML5 Audio nodes get `crossOrigin = "anonymous"` before `src`
 * is assigned. Historically required for Web Audio taps on Howler-driven radio
 * (ADR 0136). Radio listen no longer uses Howler ([ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md));
 * this patch remains for track-preview Howls that may still need CORS-safe nodes.
 *
 * Plugin SFX must NOT use Howler HTML5 under this patch when the CDN lacks ACAO
 * ([ADR 0173](../../../../docs/adrs/0173-asset-cdn-cors-for-browser-decoded-media.md)) —
 * `soundEffectsMachine` plays via a plain `Audio` element instead.
 */

import { Howler } from "howler"

type HowlerGlobal = typeof Howler & {
  _obtainHtml5Audio: () => HTMLAudioElement
  _html5AudioPool?: HTMLAudioElement[]
  __listeningRoomCorsPatched?: boolean
}

function applyCrossOrigin(audio: HTMLAudioElement): HTMLAudioElement {
  try {
    if (audio.crossOrigin !== "anonymous") {
      audio.crossOrigin = "anonymous"
    }
  } catch {
    /* ignore */
  }
  return audio
}

/** Idempotent. Safe to call from module scope and again from React. */
export function ensureHowlerHtml5Cors(): void {
  const howler = Howler as HowlerGlobal
  if (howler.__listeningRoomCorsPatched) return
  if (typeof howler._obtainHtml5Audio !== "function") return
  howler.__listeningRoomCorsPatched = true

  const pool = howler._html5AudioPool
  if (Array.isArray(pool)) {
    for (const audio of pool) {
      if (audio) applyCrossOrigin(audio)
    }
  }

  const originalObtain = howler._obtainHtml5Audio.bind(howler)
  howler._obtainHtml5Audio = () => applyCrossOrigin(originalObtain())
}

/** Best-effort HTML5 node from a Howl (html5 mode). */
export function getHowlHtml5AudioElement(howl: object): HTMLAudioElement | null {
  const sounds = (howl as { _sounds?: Array<{ _node?: unknown }> })._sounds
  const node = sounds?.[0]?._node
  return node instanceof HTMLAudioElement ? node : null
}
