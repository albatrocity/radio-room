/**
 * Screen Effects Actor
 *
 * Singleton actor that manages screen effect (CSS animation) playback.
 * Socket subscription is managed internally via the machine's subscribe action.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 *
 * Screen effects are played one at a time from a queue. When a plugin emits
 * a SCREEN_EFFECT_QUEUED event, the effect is added to the queue and played
 * in order.
 */

import { createActor } from "xstate"
import { screenEffectsMachine, ScreenEffect } from "../machines/screenEffectsMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const screenEffectsActor = createActor(screenEffectsMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a screen effect is currently playing.
 */
export function isPlayingScreenEffect(): boolean {
  return screenEffectsActor.getSnapshot().matches({ active: "playing" })
}

/**
 * Get the number of queued screen effects.
 */
export function getQueuedScreenEffectsCount(): number {
  return screenEffectsActor.getSnapshot().context.queue.length
}

/**
 * Get the current screen effect being played.
 */
export function getCurrentEffect(): ScreenEffect | null {
  return screenEffectsActor.getSnapshot().context.currentEffect
}

/**
 * Signal that the current effect has finished playing.
 * Called by the ScreenEffectsProvider when the animation ends.
 */
export function signalEffectEnded(): void {
  screenEffectsActor.send({ type: "EFFECT_ENDED" })
}

/**
 * Signal that the current effect encountered an error.
 * Called by the ScreenEffectsProvider when the animation fails.
 */
export function signalEffectError(): void {
  screenEffectsActor.send({ type: "EFFECT_ERROR" })
}

