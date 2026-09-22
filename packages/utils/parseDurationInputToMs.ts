/**
 * Parse clock / bare-seconds duration text to milliseconds.
 * Accepts `m:ss`, `mm:ss`, `h:mm:ss`, or a bare integer as seconds.
 * Returns null for empty / incomplete / invalid input (e.g. mid-typing `3:`).
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
