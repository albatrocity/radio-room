/**
 * Parse plain-language poll close times for the admin PollAuthor UI (ADR 0189).
 *
 * Accepts durations ("20 seconds", "20s", "10m", "10 min", "1h30m", "90") and
 * clock times ("10:30pm", "10pm", "22:30"). Empty input means no deadline.
 */

import { POLL_CLOSE_DURATION_MS } from "@repo/types/Poll"

export type ParsePollCloseTimeOk = {
  ok: true
  durationMs: number
  closesAt: number
}

export type ParsePollCloseTimeErr = {
  ok: false
  error: string
}

export type ParsePollCloseTimeResult = ParsePollCloseTimeOk | ParsePollCloseTimeErr

const DURATION_TOKEN =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/gi

function parseDurationMs(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null

  // Bare number → seconds
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000)
  }

  let total = 0
  let matched = false
  for (const match of trimmed.matchAll(DURATION_TOKEN)) {
    matched = true
    const value = Number(match[1])
    const unit = (match[2] ?? "").toLowerCase()
    if (!Number.isFinite(value)) return null
    if (unit.startsWith("h")) total += value * 3_600_000
    else if (unit.startsWith("m")) total += value * 60_000
    else total += value * 1000
  }

  if (!matched) return null
  // Reject leftover non-whitespace that wasn't consumed
  const stripped = trimmed.replace(DURATION_TOKEN, "").replace(/[\s,]+/g, "")
  if (stripped.length > 0) return null
  return Math.round(total)
}

function parseClockTime(raw: string, now: Date): number | null {
  const trimmed = raw.trim().toLowerCase()

  // 10pm / 10 am
  const simple = /^(\d{1,2})\s*(am|pm)$/.exec(trimmed)
  if (simple) {
    return buildClockTarget(Number(simple[1]), 0, 0, simple[2]!, now)
  }

  // 10:30pm / 10:30:00pm / 22:30 / 22:30:00
  const withMinutes = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/.exec(trimmed)
  if (!withMinutes) return null

  return buildClockTarget(
    Number(withMinutes[1]),
    Number(withMinutes[2]),
    withMinutes[3] != null ? Number(withMinutes[3]) : 0,
    withMinutes[4] ?? null,
    now,
  )
}

function buildClockTarget(
  hour: number,
  minute: number,
  second: number,
  meridiem: string | null,
  now: Date,
): number | null {
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null
  if (minute > 59 || second > 59) return null

  let h = hour
  if (meridiem) {
    if (h < 1 || h > 12) return null
    if (meridiem === "am") {
      h = h === 12 ? 0 : h
    } else {
      h = h === 12 ? 12 : h + 12
    }
  } else if (h > 23) {
    return null
  }

  const target = new Date(now)
  target.setHours(h, minute, second, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime()
}

function formatBoundsError(durationMs: number): string | null {
  if (durationMs < POLL_CLOSE_DURATION_MS.min) {
    return `Must be at least ${POLL_CLOSE_DURATION_MS.min / 1000} seconds.`
  }
  if (durationMs > POLL_CLOSE_DURATION_MS.max) {
    return `Must be at most ${POLL_CLOSE_DURATION_MS.max / 3_600_000} hours.`
  }
  return null
}

/**
 * Parse admin "Closes" text into a server-ready durationMs.
 * Pass `now` for deterministic tests.
 */
export function parsePollCloseTime(
  input: string,
  now: Date | number = Date.now(),
): ParsePollCloseTimeResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: "Enter a duration or time, or leave blank for no deadline." }
  }

  const nowDate = typeof now === "number" ? new Date(now) : now
  const nowMs = nowDate.getTime()

  const durationMs = parseDurationMs(trimmed)
  if (durationMs != null) {
    const bounds = formatBoundsError(durationMs)
    if (bounds) return { ok: false, error: bounds }
    return { ok: true, durationMs, closesAt: nowMs + durationMs }
  }

  const closesAt = parseClockTime(trimmed, nowDate)
  if (closesAt != null) {
    const relative = closesAt - nowMs
    const bounds = formatBoundsError(relative)
    if (bounds) return { ok: false, error: bounds }
    return { ok: true, durationMs: relative, closesAt }
  }

  return {
    ok: false,
    error: 'Try "20 seconds", "10m", "1h30m", or a time like "10:30pm".',
  }
}

/** Empty input → no deadline; invalid input → error. */
export function parseOptionalPollCloseTime(
  input: string,
  now: Date | number = Date.now(),
): { ok: true; durationMs: number | null; closesAt: number | null } | ParsePollCloseTimeErr {
  if (!input.trim()) {
    return { ok: true, durationMs: null, closesAt: null }
  }
  const parsed = parsePollCloseTime(input, now)
  if (!parsed.ok) return parsed
  return { ok: true, durationMs: parsed.durationMs, closesAt: parsed.closesAt }
}

export function formatClosesPreview(closesAt: number, now: number = Date.now()): string {
  const at = new Date(closesAt)
  const time = at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  const remainingMs = Math.max(0, closesAt - now)
  const remainingMin = Math.round(remainingMs / 60_000)
  if (remainingMin < 1) {
    const secs = Math.max(1, Math.round(remainingMs / 1000))
    return `Closes at ${time}, in ${secs}s`
  }
  if (remainingMin < 60) {
    return `Closes at ${time}, in ${remainingMin} min`
  }
  const hours = Math.floor(remainingMin / 60)
  const mins = remainingMin % 60
  return mins > 0
    ? `Closes at ${time}, in ${hours}h ${mins}m`
    : `Closes at ${time}, in ${hours}h`
}
