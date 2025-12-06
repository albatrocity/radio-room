/**
 * Audio Actor
 *
 * Singleton actor that manages audio playback state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room with audio, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { audioMachine } from "../machines/audioMachine"
import { RoomMeta } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const audioActor = createActor(audioMachine).start()

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
  return audioActor.getSnapshot().matches({ active: { online: { progress: "playing" } } })
}

/**
 * Check if audio is muted.
 */
export function isMuted(): boolean {
  return audioActor.getSnapshot().matches({ active: { online: { volume: "muted" } } })
}

/**
 * Check if audio is online.
 */
export function isOnline(): boolean {
  return audioActor.getSnapshot().matches({ active: "online" })
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
