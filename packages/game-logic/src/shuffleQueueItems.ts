import type { QueueItem } from "@repo/types"

/**
 * Fisher–Yates shuffle of queue items. Empty/single-item arrays return a shallow copy.
 */
export function shuffleQueueItems(
  items: QueueItem[],
  rng: () => number = Math.random,
): QueueItem[] {
  if (items.length <= 1) return [...items]
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i]!, out[j]!] = [out[j]!, out[i]!]
  }
  return out
}
