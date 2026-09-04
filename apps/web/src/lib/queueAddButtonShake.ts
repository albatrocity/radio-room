import { PLAYBACK_DEVICE_MISSING_REASON } from "@repo/types"

type ArmedButtonRef = { deref: () => HTMLElement | undefined }

/** Last Add button clicked while a queue request is in flight. WeakRef so a
 *  hung request cannot pin a detached subtree after the component unmounts. */
let armedButton: ArmedButtonRef | null = null

function toWeakHtmlRef(element: HTMLElement): ArmedButtonRef {
  const WeakRefCtor = (
    globalThis as unknown as {
      WeakRef: new (target: HTMLElement) => ArmedButtonRef
    }
  ).WeakRef
  return new WeakRefCtor(element)
}

export function armQueueAddButtonShake(element: HTMLElement | null): void {
  armedButton = element ? toWeakHtmlRef(element) : null
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
  const element = armedButton?.deref() ?? null
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
