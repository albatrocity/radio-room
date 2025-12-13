/**
 * Screen Effects Provider
 *
 * A component that subscribes to the screenEffectsActor and applies
 * CSS animations to DOM elements based on queued effects.
 *
 * This component should be rendered once near the root of the app
 * (inside the room context) to handle all screen effect animations.
 */

import { useEffect, useRef } from "react"
import { useSelector } from "@xstate/react"
import {
  screenEffectsActor,
  signalEffectEnded,
  signalEffectError,
} from "../actors/screenEffectsActor"
import { findTargetElement, applyAnimation } from "../lib/screenEffects"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"
import type { ScreenEffect } from "../machines/screenEffectsMachine"

// Maximum number of retries to find an element (for timing issues)
const MAX_RETRIES = 10
// Delay between retries in milliseconds
const RETRY_DELAY_MS = 50

/**
 * Select the current effect from the actor state.
 */
const selectCurrentEffect = (state: { context: { currentEffect: ScreenEffect | null } }) =>
  state.context.currentEffect

/**
 * Try to find an element with retries.
 * This handles cases where the screen effect arrives before the target element is rendered.
 */
async function findElementWithRetry(
  target: ScreenEffect["target"],
  targetId: string | undefined,
  maxRetries: number = MAX_RETRIES,
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const element = findTargetElement(target, targetId)
    if (element) return element

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
  return null
}

export function ScreenEffectsProvider() {
  const currentEffect = useSelector(screenEffectsActor, selectCurrentEffect)
  const animationsEnabled = useAnimationsEnabled()
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!currentEffect) return

    // If animations are disabled, skip the animation
    // but still signal that the effect "ended" so the queue continues
    if (!animationsEnabled) {
      signalEffectEnded()
      return
    }

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    const { target, targetId, effect, duration } = currentEffect

    // Find the target element in the DOM (with retries for timing issues)
    findElementWithRetry(target, targetId)
      .then((element) => {
        if (signal.aborted) return

        if (!element) {
          console.warn(
            `[ScreenEffects] Target element not found after retries: ${target}${
              targetId ? `:${targetId}` : ""
            }`,
          )
          signalEffectError()
          return
        }

        // Apply the animation and wait for it to complete
        return applyAnimation(element, effect, duration)
      })
      .then(() => {
        if (!signal.aborted) {
          signalEffectEnded()
        }
      })
      .catch((error) => {
        if (!signal.aborted) {
          console.error("[ScreenEffects] Animation error:", error)
          signalEffectError()
        }
      })

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [currentEffect, animationsEnabled])

  // This component doesn't render anything - it just manages side effects
  return null
}

export default ScreenEffectsProvider
