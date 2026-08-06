import type { BingoCriterion, QueueItem } from "@repo/types"

/** Case-insensitive substring; empty needle never matches. */
export function containsNormalized(haystack: string | null | undefined, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return false
  return (haystack ?? "").toLowerCase().includes(n)
}

/** Parse calendar year from `album.releaseDate` (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`). */
export function parseReleaseYear(queueItem: QueueItem): number | null {
  const raw = queueItem.track?.album?.releaseDate?.trim()
  if (!raw) return null
  const yearStr = raw.split("-")[0]
  if (!yearStr || !/^\d{4}$/.test(yearStr)) return null
  const year = Number(yearStr)
  return Number.isFinite(year) ? year : null
}

export function matchesCriterion(queueItem: QueueItem, criterion: BingoCriterion): boolean {
  switch (criterion.type) {
    case "free":
      return true
    case "releaseYearEq": {
      const year = parseReleaseYear(queueItem)
      return year != null && year === criterion.year
    }
    case "releaseYearBetween": {
      const year = parseReleaseYear(queueItem)
      if (year == null) return false
      const lo = Math.min(criterion.startYear, criterion.endYear)
      const hi = Math.max(criterion.startYear, criterion.endYear)
      return year >= lo && year <= hi
    }
    case "releaseDecadeEq": {
      const year = parseReleaseYear(queueItem)
      if (year == null) return false
      const decadeStart = Math.floor(criterion.decade / 10) * 10
      return year >= decadeStart && year <= decadeStart + 9
    }
    case "artistContains": {
      const artists = queueItem.track?.artists ?? []
      return artists.some((a) => containsNormalized(a.title, criterion.value))
    }
    case "titleContains":
      return containsNormalized(queueItem.track?.title ?? queueItem.title, criterion.value)
    case "albumContains":
      return containsNormalized(queueItem.track?.album?.title, criterion.value)
    case "addedByContains":
      return containsNormalized(queueItem.addedBy?.username, criterion.value)
    case "durationGt": {
      const d = queueItem.track?.duration
      if (d == null || d <= 0) return false
      return d > criterion.durationMs
    }
    case "durationLt": {
      const d = queueItem.track?.duration
      if (d == null || d <= 0) return false
      return d < criterion.durationMs
    }
  }
}
