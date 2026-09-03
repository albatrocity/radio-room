import { randomUUID } from "node:crypto"
import type { BingoCard, BingoCardCell, BingoCriterion } from "@repo/types"
import { shuffleInPlace, type ShuffleRng } from "@repo/plugin-base/helpers"
import { labelForCriterion } from "./labels"
import {
  BINGO_FILLABLE_CELLS,
  BINGO_FREE_COL,
  BINGO_FREE_ROW,
  BINGO_GRID_SIZE,
  type BingoCategory,
  type BingoRoundCategorySnapshot,
} from "./types"

export type DealRng = ShuffleRng

function defaultRng(): number {
  return Math.random()
}

function withId(criterion: BingoCriterion): BingoCriterion {
  const id = criterion.id?.trim() || randomUUID()
  return { ...criterion, id }
}

/** Build the pool of criteria used to fill non-free cells for a category. */
export function buildCriterionPool(
  category: BingoCategory,
  snapshot: BingoRoundCategorySnapshot,
): BingoCriterion[] {
  if (category === "mixed") {
    return (snapshot.criteria ?? []).map((c) => withId(c))
  }

  if (category === "releaseYear") {
    const start = snapshot.yearStart ?? 1960
    const end = snapshot.yearEnd ?? 1980
    const lo = Math.min(start, end)
    const hi = Math.max(start, end)
    const pool: BingoCriterion[] = []
    for (let y = lo; y <= hi; y++) {
      pool.push(withId({ id: "", type: "releaseYearEq", year: y }))
    }
    return pool
  }

  // releaseDecade
  const start = snapshot.decadeStart ?? 1930
  const end = snapshot.decadeEnd ?? 2010
  const lo = Math.floor(Math.min(start, end) / 10) * 10
  const hi = Math.floor(Math.max(start, end) / 10) * 10
  const pool: BingoCriterion[] = []
  for (let d = lo; d <= hi; d += 10) {
    pool.push(withId({ id: "", type: "releaseDecadeEq", decade: d }))
  }
  return pool
}

/**
 * Sample `count` criteria from `pool`.
 * - Mixed (unique): without replacement when pool.length >= count.
 * - Year/decade: with replacement when pool is smaller than count.
 */
export function sampleCriteria(
  pool: BingoCriterion[],
  count: number,
  opts: { unique: boolean; rng?: DealRng } = { unique: true },
): BingoCriterion[] {
  const rng = opts.rng ?? defaultRng
  if (pool.length === 0) {
    throw new Error("Cannot sample from an empty criterion pool")
  }

  if (opts.unique) {
    if (pool.length < count) {
      throw new Error(`Need at least ${count} criteria, got ${pool.length}`)
    }
    const shuffled = shuffleInPlace([...pool], rng)
    return shuffled.slice(0, count).map((c) => withId({ ...c, id: randomUUID() } as BingoCriterion))
  }

  const out: BingoCriterion[] = []
  for (let i = 0; i < count; i++) {
    const pick = pool[Math.floor(rng() * pool.length)]!
    out.push(withId({ ...pick, id: randomUUID() } as BingoCriterion))
  }
  return out
}

export function validatePoolForCategory(
  category: BingoCategory,
  pool: BingoCriterion[],
): { ok: true } | { ok: false; message: string } {
  if (pool.length === 0) {
    return { ok: false, message: "No criteria available for this category." }
  }
  if (category === "mixed" && pool.length < BINGO_FILLABLE_CELLS) {
    return {
      ok: false,
      message: `Mixed bingo needs at least ${BINGO_FILLABLE_CELLS} criteria (have ${pool.length}).`,
    }
  }
  return { ok: true }
}

/** Deal a 5×5 card with free center for `userId`. */
export function dealBingoCard(
  userId: string,
  category: BingoCategory,
  snapshot: BingoRoundCategorySnapshot,
  rng: DealRng = defaultRng,
): BingoCard {
  const pool = buildCriterionPool(category, snapshot)
  const validation = validatePoolForCategory(category, pool)
  if (!validation.ok) {
    throw new Error(validation.message)
  }

  const unique = category === "mixed"
  const picked = sampleCriteria(pool, BINGO_FILLABLE_CELLS, { unique, rng })

  const cells: BingoCardCell[] = []
  let pickIndex = 0
  for (let r = 0; r < BINGO_GRID_SIZE; r++) {
    for (let c = 0; c < BINGO_GRID_SIZE; c++) {
      if (r === BINGO_FREE_ROW && c === BINGO_FREE_COL) {
        const free = withId({ id: "", type: "free" })
        cells.push({
          r,
          c,
          criterionId: free.id,
          label: labelForCriterion(free),
          marked: true,
          free: true,
          criterion: free,
        })
        continue
      }
      const criterion = picked[pickIndex++]!
      cells.push({
        r,
        c,
        criterionId: criterion.id,
        label: labelForCriterion(criterion),
        marked: false,
        criterion,
      })
    }
  }

  return { userId, cells, status: "playing" }
}
