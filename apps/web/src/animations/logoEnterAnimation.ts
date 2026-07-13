import { createTimeline } from "animejs"

/** Approximate center of the logo aperture in the SVG viewBox (294.29 × 315.88). */
export const LOGO_HOLE_TRANSFORM_ORIGIN = "30% 32%"

export const logoEnterTiming = {
  scale: 650,
  fadeDelay: 180,
  fade: 520,
  scaleTo: 22,
} as const

/**
 * Zooms into the logo's aperture (scale up from the hole origin) while fading
 * the lobby root out, then invokes `onComplete` (typically navigation).
 * Returns a cleanup that reverts the timeline and completes if interrupted.
 */
export function runLogoEnterAnimation(
  logoEl: HTMLElement,
  rootEl: HTMLElement,
  onComplete: () => void,
): () => void {
  const t = logoEnterTiming
  let cancelled = false
  let completed = false

  logoEl.style.transformOrigin = LOGO_HOLE_TRANSFORM_ORIGIN

  const tl = createTimeline({ autoplay: true })

  tl.add(
    logoEl,
    {
      scale: { from: 1, to: t.scaleTo, duration: t.scale, ease: "in(2.5)" },
    },
    0,
  )

  tl.add(
    rootEl,
    {
      opacity: { from: 1, to: 0, duration: t.fade, ease: "in(2)" },
    },
    t.fadeDelay,
  )

  void tl.then(() => {
    if (cancelled) return
    completed = true
    onComplete()
  })

  return () => {
    cancelled = true
    tl.revert()
    if (!completed) onComplete()
  }
}
