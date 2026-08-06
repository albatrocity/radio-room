import { bingoCriterionSchema, type BingoConfigCriterion } from "./types"

/**
 * Parse clock / bare-seconds duration text to milliseconds (plugin-local; avoid
 * depending on @repo/plugin-config-ui from the server path).
 */
export function parseDurationInputToMs(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000
  }

  const parts = trimmed.split(":")
  if (parts.length === 2) {
    const [mStr, sStr] = parts
    if (!mStr || !sStr || !/^\d+$/.test(mStr) || !/^\d{1,2}$/.test(sStr)) return null
    const m = Number(mStr)
    const s = Number(sStr)
    if (s >= 60) return null
    return (m * 60 + s) * 1000
  }

  if (parts.length === 3) {
    const [hStr, mStr, sStr] = parts
    if (
      !hStr ||
      !mStr ||
      !sStr ||
      !/^\d+$/.test(hStr) ||
      !/^\d{1,2}$/.test(mStr) ||
      !/^\d{1,2}$/.test(sStr)
    ) {
      return null
    }
    const h = Number(hStr)
    const m = Number(mStr)
    const s = Number(sStr)
    if (m >= 60 || s >= 60) return null
    return (h * 3600 + m * 60 + s) * 1000
  }

  return null
}

type ParseOk = { ok: true; rows: BingoConfigCriterion[] }
type ParseErr = { ok: false; message: string }

function parseLine(line: string): BingoConfigCriterion | string {
  const yearEq = line.match(/^year\s+(-?\d+)\s*$/i)
  if (yearEq) {
    return { id: "", type: "releaseYearEq", year: Number(yearEq[1]), value: "", durationMs: 0 }
  }

  const yearBetween = line.match(/^year-between\s+(-?\d+)\s+(-?\d+)\s*$/i)
  if (yearBetween) {
    return {
      id: "",
      type: "releaseYearBetween",
      startYear: Number(yearBetween[1]),
      endYear: Number(yearBetween[2]),
      value: "",
      durationMs: 0,
    }
  }

  const contains = line.match(/^(artist|title|album|added-by)\s+(.+)$/i)
  if (contains) {
    const kind = contains[1].toLowerCase()
    const value = contains[2].trim()
    const type =
      kind === "artist"
        ? "artistContains"
        : kind === "title"
          ? "titleContains"
          : kind === "album"
            ? "albumContains"
            : "addedByContains"
    return { id: "", type, value, durationMs: 0 }
  }

  const duration = line.match(/^duration-(gt|lt)\s+(.+)$/i)
  if (duration) {
    const ms = parseDurationInputToMs(duration[2])
    if (ms == null || ms <= 0) {
      return `invalid duration "${duration[2].trim()}" (use m:ss or seconds)`
    }
    return {
      id: "",
      type: duration[1].toLowerCase() === "gt" ? "durationGt" : "durationLt",
      value: "",
      durationMs: ms,
    }
  }

  return `unrecognized criterion (expected year / year-between / artist / title / album / added-by / duration-gt / duration-lt)`
}

/**
 * Parse pasted Mixed criteria into config rows.
 * One criterion per line; `#` comments and blank lines ignored.
 * Fails the whole import on the first bad line (with line number).
 */
export function parseBingoCriteriaImport(rawText: string): ParseOk | ParseErr {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n")
  const rows: BingoConfigCriterion[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const parsed = parseLine(trimmed)
    if (typeof parsed === "string") {
      return { ok: false, message: `Line ${i + 1}: ${parsed}` }
    }

    const validated = bingoCriterionSchema.safeParse(parsed)
    if (!validated.success) {
      const issue = validated.error.issues[0]?.message ?? "invalid criterion"
      return { ok: false, message: `Line ${i + 1}: ${issue}` }
    }
    rows.push(validated.data)
  }

  return { ok: true, rows }
}
