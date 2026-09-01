/**
 * Radio Stream Actor
 *
 * Singleton wrapper around `radioStreamMachine`. Components drive play/pause/volume
 * through these helpers; the machine owns lifecycle and the active transport owns
 * audible output. The oscilloscope reads aligned PCM from `analysisTap`.
 */

import { createActor } from "xstate"
import { radioStreamMachine } from "../machines/radioStreamMachine"
import { getAnalysisTapDebug } from "../lib/mse/analysisTap"
import {
  ensureRadioPlaybackElement,
  getRadioPlaybackDebug,
  playRadioPlayback,
  radioPlaybackVolumeIsSettable,
  setRadioPlaybackMuted,
  setRadioPlaybackUrl,
  setRadioPlaybackVolume,
  teardownRadioPlaybackElement,
  type RadioPlaybackDebug,
} from "../lib/radioPlaybackElement"
import {
  ensureRadioMseElement,
  getRadioMseDebug,
  playRadioMse,
  radioMseVolumeIsSettable,
  setRadioMseMuted,
  setRadioMseVolume,
  startRadioMseStream,
  teardownRadioMseElement,
  useMseRadioTransport,
  type RadioMseDebug,
} from "../lib/mse/radioMseTransport"

export type RadioStreamPlayerStatus = {
  phase: "idle" | "connecting" | "streaming" | "error"
  url: string | null
  error: string | null
  suspended: boolean
  playingDesired: boolean
}

type PlayerCallbacks = {
  onLoad?: () => void
  onPlay?: () => void
  onError?: (message: string) => void
}

let callbacks: PlayerCallbacks = {}

export const radioStreamActor = createActor(radioStreamMachine).start()

radioStreamActor.on("playbackStarted", () => {
  callbacks.onLoad?.()
  callbacks.onPlay?.()
})

radioStreamActor.on("failed", ({ message }) => {
  callbacks.onError?.(message)
})

function phaseFor(snapshot: ReturnType<typeof radioStreamActor.getSnapshot>) {
  if (snapshot.matches("failed")) return "error" as const
  if (snapshot.matches({ active: "playing" })) return "streaming" as const
  if (snapshot.matches("active") || snapshot.matches("reconnecting")) {
    return "connecting" as const
  }
  return "idle" as const
}

export function getRadioStreamPlayerStatus(): RadioStreamPlayerStatus {
  const snapshot = radioStreamActor.getSnapshot()
  const { url, playing, error } = snapshot.context
  return {
    phase: phaseFor(snapshot),
    url,
    error,
    suspended: !playing,
    playingDesired: playing,
  }
}

export function subscribeRadioStreamPlayerStatus(listener: () => void): () => void {
  const subscription = radioStreamActor.subscribe(() => listener())
  return () => subscription.unsubscribe()
}

export function configureRadioStreamPlayer(next: PlayerCallbacks): void {
  callbacks = next
}

export function setRadioStreamPlayerUrl(url: string): void {
  radioStreamActor.send({ type: "SET_URL", url })
}

export function setRadioStreamPlayerPlaying(playing: boolean): void {
  radioStreamActor.send({ type: playing ? "PLAY" : "PAUSE" })
}

export function setRadioStreamPlayerVolume(next: number): void {
  setRadioPlaybackVolume(next)
  setRadioMseVolume(next)
}

export function setRadioStreamPlayerMuted(next: boolean): void {
  setRadioPlaybackMuted(next)
  setRadioMseMuted(next)
}

export function radioStreamVolumeIsSettable(): boolean {
  const { mseRejected } = radioStreamActor.getSnapshot().context
  if (useMseRadioTransport(mseRejected)) return radioMseVolumeIsSettable()
  return radioPlaybackVolumeIsSettable()
}

/** Oscilloscope requires MSE — hidden on plain-element fallback. */
export function radioStreamOscilloscopeSupported(): boolean {
  const { mseRejected } = radioStreamActor.getSnapshot().context
  return useMseRadioTransport(mseRejected)
}

export function primeRadioStreamPlayerFromGesture(): void {
  const { url, mseRejected } = radioStreamActor.getSnapshot().context
  if (useMseRadioTransport(mseRejected)) {
    ensureRadioMseElement()
    if (url) startRadioMseStream(url)
    playRadioMse()
  } else {
    ensureRadioPlaybackElement()
    if (url) setRadioPlaybackUrl(url)
    playRadioPlayback()
  }
}

export function stopRadioStreamPlayer(): void {
  radioStreamActor.send({ type: "TEARDOWN" })
  teardownRadioMseElement()
  teardownRadioPlaybackElement()
  callbacks = {}
}

export type RadioStreamPlayerDebug = RadioPlaybackDebug &
  RadioMseDebug & {
    phase: RadioStreamPlayerStatus["phase"]
    state: string
    error: string | null
    playingDesired: boolean
    mseRejected: boolean
    transport: "mse" | "element"
    tapActive: boolean
    tapBufferedSec: number
  }

/** Console diagnostics: `window.__radioAudioDebug?.()` in a room. */
export function getRadioStreamPlayerDebug(): RadioStreamPlayerDebug {
  const snapshot = radioStreamActor.getSnapshot()
  const { mseRejected } = snapshot.context
  const tap = getAnalysisTapDebug()
  return {
    ...getRadioPlaybackDebug(),
    ...getRadioMseDebug(),
    phase: phaseFor(snapshot),
    state: JSON.stringify(snapshot.value),
    error: snapshot.context.error,
    playingDesired: snapshot.context.playing,
    mseRejected,
    transport: useMseRadioTransport(mseRejected) ? "mse" : "element",
    tapActive: tap.active,
    tapBufferedSec: tap.bufferedSec,
  }
}

/** Test helper */
export function __resetRadioStreamPlayerForTests(): void {
  stopRadioStreamPlayer()
}
