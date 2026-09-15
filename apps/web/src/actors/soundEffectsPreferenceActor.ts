/**
 * Sound Effects Preference Actor
 *
 * Singleton actor that manages the user's sound-effects preference.
 * Survives room leave/enter (unlike soundEffectsActor, which DEACTIVATEs).
 * When disabled, flushes any in-flight / queued SFX.
 */

import { createActor } from "xstate"
import { soundEffectsPreferenceMachine } from "../machines/soundEffectsPreferenceMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const soundEffectsPreferenceActor = createActor(
  soundEffectsPreferenceMachine,
).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * True when the user allows plugin sound effects to play.
 */
export function areSoundEffectsEnabled(): boolean {
  return soundEffectsPreferenceActor.getSnapshot().context.enabled
}

function flushSoundEffectsIfDisabled(): void {
  if (areSoundEffectsEnabled()) return
  // Dynamic import avoids a cycle: soundEffectsMachine reads this actor.
  void import("./soundEffectsActor").then(({ soundEffectsActor }) => {
    soundEffectsActor.send({ type: "FLUSH" })
  })
}

/**
 * Toggle the sound effects preference. Flushes playback when turning off.
 */
export function toggleSoundEffectsEnabled(): void {
  soundEffectsPreferenceActor.send({ type: "TOGGLE_SOUND_EFFECTS_ENABLED" })
  flushSoundEffectsIfDisabled()
}

/**
 * Set the sound effects preference to a specific value. Flushes when disabled.
 */
export function setSoundEffectsEnabled(value: boolean): void {
  soundEffectsPreferenceActor.send({ type: "SET_SOUND_EFFECTS_ENABLED", value })
  if (!value) {
    flushSoundEffectsIfDisabled()
  }
}
