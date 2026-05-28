import { createTimeline } from "animejs"

/** Tunable timings (ms) for the play/pause attention loop while stopped. */
export const playPauseAttentionTiming = {
  jumpUp: 120,
  jumpDown: 120,
  wiggleLeft: 80,
  wiggleRight: 80,
  wiggleCenter: 80,
  /** Idle gap before the next wiggle+jump cycle. */
  loopPause: 1000,
} as const

/**
 * Repeating wiggle + jump on the play control while `playing === false`.
 * Returns cleanup that reverts the timeline and inline transforms.
 */
export function runPlayPauseAttentionLoop(buttonEl: HTMLElement): () => void {
  const t = playPauseAttentionTiming

  const tl = createTimeline({
    autoplay: true,
    loop: true,
    loopDelay: t.loopPause,
  })

  tl.add(
    buttonEl,
    {
      keyframes: [
        { translateY: 0, rotate: 0, duration: 0 },
        { translateY: -6, duration: t.jumpUp, ease: "outQuad" },
        { translateY: 0, duration: t.jumpDown, ease: "inOutQuad" },
        { rotate: -7, duration: t.wiggleLeft, ease: "inOutQuad" },
        { rotate: 7, duration: t.wiggleRight, ease: "inOutQuad" },
        { rotate: -7, duration: t.wiggleLeft, ease: "inOutQuad" },
        { rotate: 0, duration: t.wiggleCenter, ease: "inOutQuad" },
      ],
    },
    0,
  )

  return () => {
    tl.revert()
  }
}
