import { createTimeline } from "animejs"

export const voteTickTiming = {
  tick: 200,
} as const

export function runVoteTickAnimation(
  oldEl: HTMLElement,
  newEl: HTMLElement,
  onComplete: () => void,
): () => void {
  let cancelled = false
  let completed = false

  const tl = createTimeline({ autoplay: true })

  tl.add(
    oldEl,
    {
      translateY: { from: "0em", to: "-1em", duration: voteTickTiming.tick, ease: "outQuad" },
      opacity: { from: 1, to: 0, duration: voteTickTiming.tick, ease: "outQuad" },
    },
    0,
  )

  tl.add(
    newEl,
    {
      translateY: { from: "1em", to: "0em", duration: voteTickTiming.tick, ease: "outQuad" },
      opacity: { from: 0, to: 1, duration: voteTickTiming.tick, ease: "outQuad" },
    },
    0,
  )

  void tl.then(() => {
    if (cancelled) return
    completed = true
    // oldEl stays in the DOM; reset animated inline styles so the updated count stays visible
    oldEl.style.opacity = ""
    oldEl.style.transform = ""
    onComplete()
  })

  return () => {
    cancelled = true
    tl.revert()
    oldEl.style.opacity = ""
    oldEl.style.transform = ""
    if (!completed) onComplete()
  }
}
