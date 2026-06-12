import { createTimeline } from "animejs"

export const pollRevealTiming = {
  grow: 260,
  bar: 500,
  badge: 320,
  staggerBudgetMs: 480,
} as const

export type PollRevealBar = {
  el: HTMLElement
  finalPct: number
  finalCount: number
  countEl?: HTMLElement | null
}

export function runPollRevealAnimation(
  cardEl: HTMLElement,
  bars: PollRevealBar[],
  winnerBadgeEl: HTMLElement | null,
  onComplete: () => void,
): () => void {
  let cancelled = false
  let completed = false

  const n = Math.max(bars.length, 1)
  const perBarDelay = Math.min(60, pollRevealTiming.staggerBudgetMs / n)

  const tl = createTimeline({ autoplay: true })

  tl.add(
    cardEl,
    {
      maxHeight: { from: "auto", to: "none", duration: pollRevealTiming.grow, ease: "outQuart" },
    },
    0,
  )

  bars.forEach((bar, index) => {
    bar.el.style.setProperty("--pct", "0%")
    if (bar.countEl) bar.countEl.textContent = "0"

    tl.add(
      bar.el,
      {
        "--pct": { from: "0%", to: `${bar.finalPct}%`, duration: pollRevealTiming.bar, ease: "outQuad" },
      },
      index * perBarDelay,
    )

    if (bar.countEl) {
      tl.add(
        bar.countEl,
        {
          innerHTML: { from: 0, to: bar.finalCount, duration: pollRevealTiming.bar, ease: "outQuad", modifier: (v) => String(Math.round(Number(v))) },
        },
        index * perBarDelay,
      )
    }
  })

  if (winnerBadgeEl) {
    const badgeStart = Math.min(pollRevealTiming.staggerBudgetMs, (bars.length - 1) * perBarDelay) + pollRevealTiming.bar * 0.4
    tl.add(
      winnerBadgeEl,
      {
        opacity: { from: 0, to: 1, duration: pollRevealTiming.badge, ease: "out(3)" },
        translateY: { from: "8px", to: "0px", duration: pollRevealTiming.badge, ease: "out(3)" },
        scale: { from: 0.85, to: 1, duration: pollRevealTiming.badge, ease: "out(3)" },
      },
      badgeStart,
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
    bars.forEach((bar) => bar.el.style.setProperty("--pct", `${bar.finalPct}%`))
    if (!completed) onComplete()
  }
}
