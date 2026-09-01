/**
 * Radio Stream Actor
 *
 * Singleton wrapper around `radioStreamMachine` (ADR 0139 / 0140). Components
 * drive play/pause/volume through these helpers; the machine owns lifecycle,
 * `radioPlaybackElement` owns audible output, and `radioAnalysisEngine` owns
 * the silent decode behind the oscilloscope.
 */

import { createActor } from "xstate"
import { radioStreamMachine } from "../machines/radioStreamMachine"
import {
  getRadioAnalysisEngineDebug,
  resumeRadioAnalysisFromGesture,
  teardownRadioAnalysisGraph,
  type RadioAnalysisEngineDebug,
} from "../lib/radioAnalysisEngine"
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

export type RadioStreamPlayerStatus = {
  phase: "idle" | "connecting" | "streaming" | "error"
  url: string | null
  contentType: string | null
  httpStatus: number | null
  error: string | null
  framesScheduled: number
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
  if (snapshot.matches({ playback: "failed" })) return "error" as const
  if (snapshot.matches({ playback: { active: "playing" } })) return "streaming" as const
  if (snapshot.matches({ playback: "active" }) || snapshot.matches({ playback: "reconnecting" })) {
    return "connecting" as const
  }
  return "idle" as const
}

export function getRadioStreamPlayerStatus(): RadioStreamPlayerStatus {
  const snapshot = radioStreamActor.getSnapshot()
  const { url, playing, contentType, httpStatus, error } = snapshot.context
  return {
    phase: phaseFor(snapshot),
    url,
    contentType,
    httpStatus,
    error,
    framesScheduled: getRadioAnalysisEngineDebug().framesScheduled,
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
}

/** Covers user mute and preview ducking alike (ADR 0140). */
export function setRadioStreamPlayerMuted(next: boolean): void {
  setRadioPlaybackMuted(next)
}

/** False on iOS, where level belongs to the hardware buttons. */
export function radioStreamVolumeIsSettable(): boolean {
  return radioPlaybackVolumeIsSettable()
}

/**
 * Called from the play gesture. iOS only grants playback to an element started
 * inside a user gesture, and the machine's own `play()` lands a few React ticks
 * later — so start it here, where the gesture is still live. Redundant on
 * desktop and harmless: an already-playing element ignores `play()`.
 */
export function primeRadioStreamPlayerFromGesture(): void {
  const { url } = radioStreamActor.getSnapshot().context
  ensureRadioPlaybackElement()
  if (url) setRadioPlaybackUrl(url)
  playRadioPlayback()
  resumeRadioAnalysisFromGesture()
}

/** Visibility drives whether the silent analysis connection is worth holding. */
export function installRadioStreamPlayerListeners(): () => void {
  if (typeof document === "undefined") return () => {}
  const onVisibility = () => {
    radioStreamActor.send({ type: "VISIBILITY", visible: !document.hidden })
  }
  document.addEventListener("visibilitychange", onVisibility)
  onVisibility()
  return () => document.removeEventListener("visibilitychange", onVisibility)
}

/** The oscilloscope reports itself so the second connection is demand-driven. */
export function attachRadioScope(): () => void {
  radioStreamActor.send({ type: "SCOPE_ATTACHED" })
  return () => radioStreamActor.send({ type: "SCOPE_DETACHED" })
}

export function stopRadioStreamPlayer(): void {
  radioStreamActor.send({ type: "TEARDOWN" })
  teardownRadioAnalysisGraph()
  teardownRadioPlaybackElement()
  callbacks = {}
}

export type RadioStreamPlayerDebug = RadioAnalysisEngineDebug &
  RadioPlaybackDebug & {
    phase: RadioStreamPlayerStatus["phase"]
    state: string
    error: string | null
    playingDesired: boolean
    scopeAttached: boolean
    visible: boolean
  }

/** Console diagnostics: `window.__radioAudioDebug?.()` in a room. */
export function getRadioStreamPlayerDebug(): RadioStreamPlayerDebug {
  const snapshot = radioStreamActor.getSnapshot()
  return {
    ...getRadioAnalysisEngineDebug(),
    ...getRadioPlaybackDebug(),
    phase: phaseFor(snapshot),
    state: JSON.stringify(snapshot.value),
    error: snapshot.context.error,
    playingDesired: snapshot.context.playing,
    scopeAttached: snapshot.context.scopeAttached,
    visible: snapshot.context.visible,
  }
}

/** Test helper */
export function __resetRadioStreamPlayerForTests(): void {
  stopRadioStreamPlayer()
}
