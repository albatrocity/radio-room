import { createTimeline } from "animejs"

export const pollMountTiming = {
  slide: 240,
  pulse: 400,
} as const

export function runPollMountAnimation(
  cardEl: HTMLElement,
  onComplete: () => void,
): () => void {
  let cancelled = false
  let completed = false

  const tl = createTimeline({ autoplay: true })

  tl.add(
    cardEl,
    {
      opacity: { from: 0, to: 1, duration: pollMountTiming.slide, ease: "out(2)" },
      translateY: { from: "-16px", to: "0px", duration: pollMountTiming.slide, ease: "out(2)" },
      scale: { from: 0.98, to: 1, duration: pollMountTiming.slide, ease: "out(2)" },
    },
    0,
  )

  tl.add(
    cardEl,
    {
      boxShadow: [
        { value: "0 0 0 0 transparent", duration: 0 },
        { value: "0 0 0 3px var(--poll-accent, rgba(99, 102, 241, 0.45))", duration: pollMountTiming.pulse / 2, ease: "outQuad" },
        { value: "0 0 0 0 transparent", duration: pollMountTiming.pulse / 2, ease: "inQuad" },
      ],
    },
    "+=0",
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
