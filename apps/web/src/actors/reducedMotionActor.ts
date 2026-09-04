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

/** OS `prefers-reduced-motion` query. Shared by the actor and the React hook. */
export function prefersSystemReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** AND of system preference and in-app toggle. */
export function animationsAllowed(
  systemPrefersReduced: boolean,
  appReducedMotion: boolean,
): boolean {
  return !systemPrefersReduced && !appReducedMotion
}

/**
 * True when both the OS `prefers-reduced-motion` query and the in-app toggle
 * allow animations. Use from non-React callers; components should prefer
 * `useAnimationsEnabled`.
 */
export function areAnimationsEnabled(): boolean {
  return animationsAllowed(prefersSystemReducedMotion(), isReducedMotionEnabled())
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
