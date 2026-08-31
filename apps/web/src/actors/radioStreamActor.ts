/**
 * Radio Stream Actor
 *
 * Singleton wrapper around `radioStreamMachine` (ADR 0139). Components drive
 * play/pause/volume through these helpers; the machine owns connection
 * lifecycle and the engine owns the audio path.
 */

import { createActor } from "xstate"
import { radioStreamMachine } from "../machines/radioStreamMachine"
import {
  getRadioStreamEngineDebug,
  installRadioStreamAutoUnlock,
  primeRadioStreamFromGesture,
  setRadioStreamMuted,
  setRadioStreamVolume,
  teardownRadioStreamGraph,
  type RadioStreamEngineDebug,
} from "../lib/radioStreamEngine"

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
  if (snapshot.matches("failed")) return "error" as const
  if (snapshot.matches({ active: "streaming" })) return "streaming" as const
  if (snapshot.matches("active") || snapshot.matches("reconnecting")) return "connecting" as const
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
    framesScheduled: getRadioStreamEngineDebug().framesScheduled,
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
  setRadioStreamVolume(next)
}

export function setRadioStreamPlayerMuted(next: boolean): void {
  setRadioStreamMuted(next)
}

/** Resume + unlock the AudioContext on the user-gesture turn (play click). */
export function primeRadioStreamPlayerFromGesture(): void {
  primeRadioStreamFromGesture()
}

export function installRadioStreamPlayerAutoUnlock(): () => void {
  return installRadioStreamAutoUnlock()
}

export function stopRadioStreamPlayer(): void {
  radioStreamActor.send({ type: "TEARDOWN" })
  teardownRadioStreamGraph()
  callbacks = {}
}

export type RadioStreamPlayerDebug = RadioStreamEngineDebug & {
  phase: RadioStreamPlayerStatus["phase"]
  state: string
  error: string | null
  playingDesired: boolean
}

/** Console diagnostics: `window.__radioAudioDebug?.()` in a room. */
export function getRadioStreamPlayerDebug(): RadioStreamPlayerDebug {
  const snapshot = radioStreamActor.getSnapshot()
  return {
    ...getRadioStreamEngineDebug(),
    phase: phaseFor(snapshot),
    state: JSON.stringify(snapshot.value),
    error: snapshot.context.error,
    playingDesired: snapshot.context.playing,
  }
}

/** Test helper */
export function __resetRadioStreamPlayerForTests(): void {
  stopRadioStreamPlayer()
}
