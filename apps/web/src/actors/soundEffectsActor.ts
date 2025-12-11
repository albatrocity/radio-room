/**
 * Sound Effects Actor
 *
 * Singleton actor that manages sound effect playback.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 *
 * Sound effects are played one at a time from a queue. When a plugin emits
 * a SOUND_EFFECT_QUEUED event, the sound is added to the queue and played
 * in order.
 */

import { createActor } from "xstate"
import { soundEffectsMachine } from "../machines/soundEffectsMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const soundEffectsActor = createActor(soundEffectsMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a sound effect is currently playing.
 */
export function isPlayingSoundEffect(): boolean {
  return soundEffectsActor.getSnapshot().matches({ active: "playing" })
}

/**
 * Get the number of queued sound effects.
 */
export function getQueuedSoundEffectsCount(): number {
  return soundEffectsActor.getSnapshot().context.queue.length
}
