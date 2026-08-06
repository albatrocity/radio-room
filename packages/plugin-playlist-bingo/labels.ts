import type { BingoCriterion } from "@repo/types"

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Human-readable cell label for a criterion. */
export function labelForCriterion(criterion: BingoCriterion): string {
  switch (criterion.type) {
    case "free":
      return "FREE"
    case "releaseYearEq":
      return String(criterion.year)
    case "releaseYearBetween": {
      const lo = Math.min(criterion.startYear, criterion.endYear)
      const hi = Math.max(criterion.startYear, criterion.endYear)
      return `${lo}–${hi}`
    }
    case "releaseDecadeEq": {
      const decade = Math.floor(criterion.decade / 10) * 10
      return `${decade}s`
    }
    case "artistContains":
      return `Artist contains ${criterion.value}`
    case "titleContains":
      return `Title contains ${criterion.value}`
    case "albumContains":
      return `Album contains ${criterion.value}`
    case "addedByContains":
      return `Added by contains ${criterion.value}`
    case "durationGt":
      return `Duration > ${formatDurationMs(criterion.durationMs)}`
    case "durationLt":
      return `Duration < ${formatDurationMs(criterion.durationMs)}`
  }
}
