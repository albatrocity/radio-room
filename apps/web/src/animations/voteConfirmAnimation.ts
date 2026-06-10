import { createTimeline } from "animejs"

export const voteConfirmTiming = {
  flood: 220,
  check: 200,
  reject: 280,
} as const

export function runVoteConfirmAnimation(
  buttonEl: HTMLElement,
  checkEl: HTMLElement | null,
  onComplete: () => void,
): () => void {
  let cancelled = false
  let completed = false

  const tl = createTimeline({ autoplay: true })

  tl.add(
    buttonEl,
    {
      backgroundSize: { from: "0% 100%", to: "100% 100%", duration: voteConfirmTiming.flood, ease: "outQuad" },
    },
    0,
  )

  if (checkEl) {
    tl.add(
      checkEl,
      {
        strokeDashoffset: { from: 24, to: 0, duration: voteConfirmTiming.check, ease: "inOutQuad" },
        opacity: { from: 0, to: 1, duration: voteConfirmTiming.check / 2, ease: "outQuad" },
      },
      "+=0",
    )
  }

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

export function runVoteRejectAnimation(
  buttonEl: HTMLElement,
  onComplete: () => void,
): () => void {
  let cancelled = false
  let completed = false

  const tl = createTimeline({ autoplay: true })

  tl.add(
    buttonEl,
    {
      keyframes: [
        { x: 0, duration: 0 },
        { x: -6, duration: voteConfirmTiming.reject / 4, ease: "inOutQuad" },
        { x: 6, duration: voteConfirmTiming.reject / 4, ease: "inOutQuad" },
        { x: -3, duration: voteConfirmTiming.reject / 4, ease: "inOutQuad" },
        { x: 0, duration: voteConfirmTiming.reject / 4, ease: "inOutQuad" },
      ],
    },
    0,
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
