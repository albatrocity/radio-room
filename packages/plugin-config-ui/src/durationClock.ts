/**
 * Clock-style duration helpers for `displayUnit: "mm:ss"` config fields.
 * Values are stored in milliseconds.
 */

import { parseDurationInputToMs } from "@repo/utils"

/** Format ms as `m:ss`, or `h:mm:ss` when an hour or more. */
export function formatMsAsClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${m}:${String(s).padStart(2, "0")}`
}

/**
 * Parse clock duration text to milliseconds.
 * Accepts `m:ss`, `mm:ss`, `h:mm:ss`, or a bare integer as seconds.
 * Returns null for empty / incomplete / invalid input (e.g. mid-typing `3:`).
 */
export function parseClockDurationToMs(input: string): number | null {
  return parseDurationInputToMs(input)
}
