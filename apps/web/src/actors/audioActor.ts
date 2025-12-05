/**
 * Audio Actor
 *
 * Singleton actor that manages audio playback state.
 * Active in rooms with audio (radio type), subscribes to socket events.
 */

import { interpret } from "xstate"
import { audioMachine } from "../machines/audioMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { RoomMeta } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const audioActor = interpret(audioMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room with audio.
 */
export function subscribeAudioActor(): void {
  if (!isSubscribed) {
    subscribeActor(audioActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeAudioActor(): void {
  if (isSubscribed) {
    unsubscribeActor(audioActor)
    isSubscribed = false
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current volume (0-1).
 */
export function getVolume(): number {
  return audioActor.getSnapshot().context.volume
}

/**
 * Get audio metadata (currently playing track, etc).
 */
export function getAudioMeta(): RoomMeta | undefined {
  return audioActor.getSnapshot().context.meta
}

/**
 * Get media source status.
 */
export function getMediaSourceStatus(): "online" | "offline" | "connecting" | "unknown" {
  return audioActor.getSnapshot().context.mediaSourceStatus
}

/**
 * Check if audio is currently playing.
 */
export function isPlaying(): boolean {
  return audioActor.getSnapshot().matches({ online: { progress: "playing" } })
}

/**
 * Check if audio is muted.
 */
export function isMuted(): boolean {
  return audioActor.getSnapshot().matches({ online: { volume: "muted" } })
}

/**
 * Check if audio is online.
 */
export function isOnline(): boolean {
  return audioActor.getSnapshot().matches("online")
}

/**
 * Toggle play/stop.
 */
export function toggleAudio(): void {
  audioActor.send({ type: "TOGGLE" })
}

/**
 * Change volume.
 */
export function changeVolume(volume: number): void {
  audioActor.send({ type: "CHANGE_VOLUME", volume })
}

/**
 * Toggle mute.
 */
export function toggleMute(): void {
  audioActor.send({ type: "TOGGLE_MUTE" })
}

