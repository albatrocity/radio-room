/**
 * Reduced Motion Actor
 *
 * Singleton actor that manages the user's reduced motion preference.
 * This is separate from the system's prefers-reduced-motion media query,
 * giving users explicit control within the app.
 */

import { createActor } from "xstate"
import { reducedMotionMachine } from "../machines/reducedMotionMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const reducedMotionActor = createActor(reducedMotionMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if the user has enabled reduced motion in the app settings.
 * Note: This only checks the app preference, not the system preference.
 * Use useAnimationsEnabled() hook to check both.
 */
export function isReducedMotionEnabled(): boolean {
  return reducedMotionActor.getSnapshot().context.reducedMotion
}

/**
 * Toggle the reduced motion preference.
 */
export function toggleReducedMotion(): void {
  reducedMotionActor.send({ type: "TOGGLE_REDUCED_MOTION" })
}

/**
 * Set the reduced motion preference to a specific value.
 */
export function setReducedMotion(value: boolean): void {
  reducedMotionActor.send({ type: "SET_REDUCED_MOTION", value })
}
