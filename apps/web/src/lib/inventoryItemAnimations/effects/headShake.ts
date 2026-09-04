/** Matches animate.css `headShake` used for queue-add / Physical Media wear. */
export const HEAD_SHAKE_DURATION_MS = 600

export async function playHeadShakeEffect(element: HTMLElement): Promise<void> {
  const { applyAnimation } = await import("../../screenEffects")
  await applyAnimation(element, "headShake", HEAD_SHAKE_DURATION_MS)
}
