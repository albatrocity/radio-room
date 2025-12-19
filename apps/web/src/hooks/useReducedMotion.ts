/**
 * Reduced Motion Hooks
 *
 * Provides hooks for checking and managing the user's motion preferences.
 * Combines the system's prefers-reduced-motion media query with the
 * in-app toggle preference.
 */

import { useSyncExternalStore, useCallback } from "react"
import { reducedMotionActor } from "../actors/reducedMotionActor"

// ============================================================================
// System Preference Detection
// ============================================================================

/**
 * Check if the system prefers reduced motion.
 * Uses the prefers-reduced-motion media query.
 */
function getSystemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Subscribe to system preference changes.
 */
function subscribeToSystemPreference(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}

  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  mediaQuery.addEventListener("change", callback)
  return () => mediaQuery.removeEventListener("change", callback)
}

// ============================================================================
// Actor Subscription
// ============================================================================

/**
 * Get the current reduced motion preference from the actor.
 */
function getActorReducedMotion(): boolean {
  return reducedMotionActor.getSnapshot().context.reducedMotion
}

/**
 * Subscribe to actor state changes.
 */
function subscribeToActor(callback: () => void): () => void {
  const subscription = reducedMotionActor.subscribe(callback)
  return () => subscription.unsubscribe()
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook that checks ONLY the system's prefers-reduced-motion preference.
 * Does not include the in-app toggle.
 */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToSystemPreference,
    getSystemPrefersReducedMotion,
    () => false, // Server snapshot
  )
}

/**
 * Hook that returns the in-app animation preference and toggle function.
 * Use this for the settings toggle UI.
 *
 * Returns `animationsEnabled: true` when animations should play,
 * and `animationsEnabled: false` when animations should be disabled.
 */
export function useAnimationPreference(): {
  animationsEnabled: boolean
  toggleAnimations: () => void
} {
  const reducedMotion = useSyncExternalStore(
    subscribeToActor,
    getActorReducedMotion,
    () => false, // Server snapshot
  )

  const toggleAnimations = useCallback(() => {
    reducedMotionActor.send({ type: "TOGGLE_REDUCED_MOTION" })
  }, [])

  // Invert: reducedMotion=true means animations are disabled
  return { animationsEnabled: !reducedMotion, toggleAnimations }
}

/**
 * Hook that checks BOTH the system preference AND the in-app preference.
 * Returns true if animations should play (both system and app allow animations).
 *
 * Use this hook to determine if animations should be enabled.
 */
export function useAnimationsEnabled(): boolean {
  const systemPrefersReduced = useSystemReducedMotion()
  const { animationsEnabled: appAnimationsEnabled } = useAnimationPreference()

  // Animations are enabled only if both system and app allow them
  return !systemPrefersReduced && appAnimationsEnabled
}
