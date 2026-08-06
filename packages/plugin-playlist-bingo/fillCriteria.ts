import { BINGO_FILLABLE_CELLS, type BingoConfigCriterion } from "./types"

export type FillCriteriaResult =
  | { ok: true; criteria: BingoConfigCriterion[]; added: number; message: string }
  | { ok: false; message: string }

/**
 * Append unique `releaseYearEq` rows until the bank reaches `target` (default 24).
 * Years already present as `releaseYearEq` are skipped. Ascending, deterministic.
 */
export function fillCriteriaWithYears(input: {
  criteria: BingoConfigCriterion[]
  yearStart: number
  yearEnd: number
  target?: number
}): FillCriteriaResult {
  const target = input.target ?? BINGO_FILLABLE_CELLS
  const existing = input.criteria ?? []
  if (existing.length >= target) {
    return {
      ok: true,
      criteria: existing,
      added: 0,
      message: `Already have ${existing.length} criteria (need ${target}).`,
    }
  }

  const need = target - existing.length
  const usedYears = new Set<number>()
  for (const row of existing) {
    if (row.type === "releaseYearEq" && typeof row.year === "number" && Number.isFinite(row.year)) {
      usedYears.add(row.year)
    }
  }

  const lo = Math.min(input.yearStart, input.yearEnd)
  const hi = Math.max(input.yearStart, input.yearEnd)
  const unused: number[] = []
  for (let y = lo; y <= hi; y++) {
    if (!usedYears.has(y)) unused.push(y)
  }

  if (unused.length < need) {
    return {
      ok: false,
      message: `Need ${need} more unique years; range ${lo}–${hi} has only ${unused.length} unused.`,
    }
  }

  const addedRows: BingoConfigCriterion[] = unused.slice(0, need).map((year) => ({
    id: "",
    type: "releaseYearEq" as const,
    year,
    value: "",
    durationMs: 0,
  }))

  return {
    ok: true,
    criteria: [...existing, ...addedRows],
    added: addedRows.length,
    message: `Added ${addedRows.length} year criterion${addedRows.length === 1 ? "" : "a"} (${existing.length + addedRows.length} total).`,
  }
}
