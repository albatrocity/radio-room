/**
 * Ensure Howler HTML5 Audio nodes get `crossOrigin = "anonymous"` before `src`
 * is assigned (required for Web Audio AnalyserNode on Icecast/Shoutcast — ADR 0136).
 *
 * Howler creates / pools `Audio` in `_obtainHtml5Audio` and only then sets `src`
 * in `Sound.create`. Patching that obtain path covers pool hits and the
 * exhausted-pool `new Audio()` fallback.
 *
 * Must run before the first radio Howl is constructed (module load / import time),
 * not in a useEffect — otherwise Safari plays the stream but Web Audio stays silent.
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
