import { PLAYBACK_DEVICE_MISSING_REASON } from "@repo/types"

/** Last Add button clicked while a queue request is in flight. */
let armedButton: HTMLElement | null = null

export function armQueueAddButtonShake(element: HTMLElement | null): void {
  armedButton = element
}

export function disarmQueueAddButtonShake(): void {
  armedButton = null
}

/**
 * Play animate.css `headShake` on the armed Add button when queueing failed
 * for a missing playback device. Other failures leave the button still.
 * Screen-effect CSS and the reduced-motion actor load only if a shake runs.
 */
export function shakeArmedQueueAddButtonIfPlaybackMissing(
  failureMessage?: string,
): Promise<void> {
  const element = armedButton
  armedButton = null
  if (!element) return Promise.resolve()
  if (failureMessage !== PLAYBACK_DEVICE_MISSING_REASON) return Promise.resolve()
  return playHeadShake(element)
}

async function playHeadShake(element: HTMLElement): Promise<void> {
  const { areAnimationsEnabled } = await import("../actors/reducedMotionActor")
  if (!areAnimationsEnabled()) return
  const { applyAnimation } = await import("./screenEffects")
  await applyAnimation(element, "headShake", 600)
}
