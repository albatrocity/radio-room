import { createTimeline } from "animejs"

/** Tunable timings (ms) for the coin-gain feedback on the game-state control. */
export const coinGainButtonTiming = {
  fall: 480,
  coinFade: 140,
  impactNudge: 95,
  impactReturn: 130,
  scaleUp: 200,
  rotateCw: 160,
  rotateCcw: 160,
  settle: 240,
} as const

/**
 * Runs fall → hide coin → impact nudge → celebrate on the given nodes.
 * Invokes `onComplete` when the timeline finishes naturally.
 * Returns a cleanup function: reverts the timeline, resets coin opacity, and
 * calls `onComplete` if the run was interrupted (e.g. React Strict Mode).
 */
export function runCoinGainButtonAnimation(
  coinEl: HTMLDivElement,
  buttonEl: HTMLDivElement,
  onComplete: () => void,
): () => void {
  const t = coinGainButtonTiming
  let cancelled = false
  let completed = false

  coinEl.style.opacity = "1"

  const tl = createTimeline({ autoplay: true })

  tl.add(
    coinEl,
    {
      scale: { from: 3.5, to: 1, duration: t.fall, ease: "out(2)" },
      translateY: { from: "-4.75rem", to: "0rem", duration: t.fall, ease: "out(3)" },
    },
    0,
  )

  tl.add(
    coinEl,
    {
      opacity: { from: 1, to: 0, duration: t.coinFade, ease: "inOutQuad" },
    },
    "+=0",
  )

  tl.add(
    buttonEl,
    {
      keyframes: [
        { x: 0, y: 0, duration: 0 },
        { x: 0, y: 9, duration: t.impactNudge, ease: "outQuad" },
        { x: 0, y: 0, duration: t.impactReturn, ease: "inOutQuad" },
      ],
    },
    "+=0",
  )

  tl.add(
    buttonEl,
    {
      keyframes: [
        { scale: 1, rotate: 0, duration: 0 },
        { scale: 1.3, duration: t.scaleUp, ease: "out(2)" },
        { rotate: 10, duration: t.rotateCw, ease: "inOutQuad" },
        { rotate: -10, duration: t.rotateCcw, ease: "inOutQuad" },
        { scale: 1, rotate: 0, duration: t.settle, ease: "inOutQuad" },
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
    coinEl.style.opacity = "0"
    if (!completed) onComplete()
  }
}

/**
 * If either element is missing (e.g. coin layer not mounted), completes immediately and returns a no-op cleanup.
 */
export function runCoinGainButtonAnimationOrComplete(
  coinEl: HTMLDivElement | null,
  buttonEl: HTMLDivElement | null,
  onComplete: () => void,
): () => void {
  if (!coinEl || !buttonEl) {
    onComplete()
    return () => {}
  }
  return runCoinGainButtonAnimation(coinEl, buttonEl, onComplete)
}
