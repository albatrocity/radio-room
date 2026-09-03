export type ShuffleRng = () => number

function defaultRng(): number {
  return Math.random()
}

/** Fisher–Yates shuffle. Mutates `items` and returns it. */
export function shuffleInPlace<T>(items: T[], rng: ShuffleRng = defaultRng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

/** Sample up to `count` items from `pool` without replacement. */
export function sampleN<T>(
  pool: readonly T[],
  count: number,
  rng: ShuffleRng = defaultRng,
): T[] {
  if (count <= 0 || pool.length === 0) return []
  const copy = [...pool]
  shuffleInPlace(copy, rng)
  return copy.slice(0, Math.min(count, copy.length))
}
