import type { ShowSegmentDTO } from "@repo/types"

/** Minutes used for stacking start times (missing = 0). */
export function effectiveScheduleMinutes(ss: ShowSegmentDTO): number {
  const v = ss.durationOverride ?? ss.segment.duration
  return v ?? 0
}

export function totalEstimatedMinutes(segments: ShowSegmentDTO[]): number {
  return segments.reduce((sum, s) => sum + effectiveScheduleMinutes(s), 0)
}

/** Input display: empty when no default and no override. */
export function displayMinutesForInput(ss: ShowSegmentDTO): string {
  const v = ss.durationOverride ?? ss.segment.duration
  if (v === null) return ""
  return String(v)
}

/**
 * Value to persist as `duration_override`: null clears override (use segment default / zero).
 */
export function durationOverrideFromInput(
  segmentDefaultMinutes: number | null,
  raw: string,
): number | null {
  const t = raw.trim()
  if (t === "") return null
  const n = parseInt(t, 10)
  if (!Number.isFinite(n) || n < 0) return null
  const base = segmentDefaultMinutes ?? 0
  if (n === base) return null
  return n
}

export function formatDurationMinutes(total: number): string {
  if (total <= 0) return "—"
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function segmentStartTimes(
  showStartTime: string,
  segments: ShowSegmentDTO[],
): Date[] {
  const start = new Date(showStartTime).getTime()
  const out: Date[] = []
  let cursor = start
  for (const seg of segments) {
    out.push(new Date(cursor))
    cursor += effectiveScheduleMinutes(seg) * 60_000
  }
  return out
}
