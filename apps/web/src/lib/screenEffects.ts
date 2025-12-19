/**
 * Screen Effects Utility Library
 *
 * Provides utilities for applying and removing animate.css animations
 * to DOM elements. Used by the ScreenEffectsProvider to manage animations.
 */

import type { ScreenEffectName, ScreenEffectTarget } from "@repo/types"

// Import animate.css styles
import "animate.css"

// ============================================================================
// Constants
// ============================================================================

/**
 * Default animation durations for each effect (in milliseconds)
 * These match the default animate.css durations
 */
export const DEFAULT_EFFECT_DURATIONS: Record<ScreenEffectName, number> = {
  bounce: 1000,
  flash: 1000,
  pulse: 1000,
  rubberBand: 1000,
  shakeX: 1000,
  shakeY: 1000,
  headShake: 1000,
  swing: 1000,
  tada: 1000,
  wobble: 1000,
  jello: 1000,
  heartBeat: 1300, // heartBeat is slightly longer
}

/**
 * The animate.css class prefix
 */
const ANIMATE_PREFIX = "animate__"

// ============================================================================
// DOM Utilities
// ============================================================================

/**
 * Find the target element for a screen effect based on target type and optional ID.
 *
 * @param target - The type of target ('room', 'nowPlaying', 'message', 'plugin')
 * @param targetId - Optional ID (timestamp for messages, componentId for plugins, or "latest")
 * @returns The DOM element or null if not found
 */
export function findTargetElement(
  target: ScreenEffectTarget,
  targetId?: string,
): HTMLElement | null {
  switch (target) {
    case "room":
      return document.querySelector('[data-screen-effect-target="room"]')

    case "nowPlaying":
      return document.querySelector('[data-screen-effect-target="nowPlaying"]')

    case "message":
      if (targetId === "latest") {
        // Find the most recent message
        const messages = document.querySelectorAll('[data-screen-effect-target="message"]')
        return messages.length > 0 ? (messages[messages.length - 1] as HTMLElement) : null
      }
      // Find by specific timestamp
      return document.querySelector(
        `[data-screen-effect-target="message"][data-message-id="${targetId}"]`,
      )

    case "plugin":
      if (!targetId) return null
      return document.querySelector(
        `[data-screen-effect-target="plugin"][data-plugin-component-id="${targetId}"]`,
      )

    case "user":
      if (!targetId) return null
      return document.querySelector(
        `[data-screen-effect-target="user"][data-user-id="${targetId}"]`,
      )

    default:
      return null
  }
}

// ============================================================================
// Animation Functions
// ============================================================================

/**
 * Apply an animation effect to an element.
 *
 * @param element - The DOM element to animate
 * @param effect - The animation effect name
 * @param duration - Optional custom duration in milliseconds
 * @returns A promise that resolves when the animation ends
 */
export function applyAnimation(
  element: HTMLElement,
  effect: ScreenEffectName,
  duration?: number,
): Promise<void> {
  return new Promise((resolve) => {
    const animatedClass = `${ANIMATE_PREFIX}animated`
    const effectClass = `${ANIMATE_PREFIX}${effect}`

    // Set custom duration if provided
    if (duration) {
      element.style.setProperty("--animate-duration", `${duration}ms`)
    }

    // Apply animation classes
    element.classList.add(animatedClass, effectClass)

    // Handle animation end
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== element) return
      event.stopPropagation()
      removeAnimation(element, effect, duration)
      resolve()
    }

    element.addEventListener("animationend", handleAnimationEnd, { once: true })

    // Fallback timeout in case animationend doesn't fire
    const fallbackDuration = duration || DEFAULT_EFFECT_DURATIONS[effect] || 1000
    setTimeout(() => {
      if (element.classList.contains(effectClass)) {
        removeAnimation(element, effect, duration)
        resolve()
      }
    }, fallbackDuration + 100)
  })
}

/**
 * Remove animation classes and custom properties from an element.
 *
 * @param element - The DOM element
 * @param effect - The animation effect name
 * @param hadCustomDuration - Whether a custom duration was set
 */
export function removeAnimation(
  element: HTMLElement,
  effect: ScreenEffectName,
  hadCustomDuration?: number,
): void {
  const animatedClass = `${ANIMATE_PREFIX}animated`
  const effectClass = `${ANIMATE_PREFIX}${effect}`

  element.classList.remove(animatedClass, effectClass)

  if (hadCustomDuration) {
    element.style.removeProperty("--animate-duration")
  }
}

/**
 * Get the duration for an effect (custom or default).
 *
 * @param effect - The animation effect name
 * @param customDuration - Optional custom duration in milliseconds
 * @returns The duration in milliseconds
 */
export function getEffectDuration(effect: ScreenEffectName, customDuration?: number): number {
  return customDuration || DEFAULT_EFFECT_DURATIONS[effect] || 1000
}
