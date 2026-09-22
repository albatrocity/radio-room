import { describe, expect, it } from "vitest"
import {
  formatClosesPreview,
  parseOptionalPollCloseTime,
  parsePollCloseTime,
} from "./parsePollCloseTime"

describe("parsePollCloseTime", () => {
  const noon = new Date("2026-09-22T12:00:00")

  it("parses bare seconds", () => {
    const r = parsePollCloseTime("90", noon)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.durationMs).toBe(90_000)
  })

  it("parses unit durations", () => {
    expect(parsePollCloseTime("20 seconds", noon)).toMatchObject({
      ok: true,
      durationMs: 20_000,
    })
    expect(parsePollCloseTime("20s", noon)).toMatchObject({ ok: true, durationMs: 20_000 })
    expect(parsePollCloseTime("10m", noon)).toMatchObject({ ok: true, durationMs: 600_000 })
    expect(parsePollCloseTime("10 min", noon)).toMatchObject({ ok: true, durationMs: 600_000 })
    expect(parsePollCloseTime("1h30m", noon)).toMatchObject({
      ok: true,
      durationMs: 5_400_000,
    })
  })

  it("rejects below min and above max", () => {
    expect(parsePollCloseTime("3s", noon).ok).toBe(false)
    expect(parsePollCloseTime("25 hours", noon).ok).toBe(false)
  })

  it("parses clock times and rolls to tomorrow when past", () => {
    const am = parsePollCloseTime("10:30am", noon)
    expect(am.ok).toBe(true)
    if (am.ok) {
      // 10:30am is past noon → tomorrow
      const d = new Date(am.closesAt)
      expect(d.getDate()).toBe(23)
      expect(d.getHours()).toBe(10)
      expect(d.getMinutes()).toBe(30)
    }

    const pm = parsePollCloseTime("10:30pm", noon)
    expect(pm.ok).toBe(true)
    if (pm.ok) {
      const d = new Date(pm.closesAt)
      expect(d.getDate()).toBe(22)
      expect(d.getHours()).toBe(22)
      expect(d.getMinutes()).toBe(30)
    }

    expect(parsePollCloseTime("10pm", noon)).toMatchObject({ ok: true })
    expect(parsePollCloseTime("22:30", noon)).toMatchObject({ ok: true })
  })

  it("rejects unknown formats", () => {
    expect(parsePollCloseTime("soon", noon).ok).toBe(false)
  })
})

describe("parseOptionalPollCloseTime", () => {
  it("treats empty as no deadline", () => {
    expect(parseOptionalPollCloseTime("  ")).toEqual({
      ok: true,
      durationMs: null,
      closesAt: null,
    })
  })
})

describe("formatClosesPreview", () => {
  it("formats a short remaining window", () => {
    const now = Date.parse("2026-09-22T12:00:00")
    const closesAt = now + 47 * 60_000
    expect(formatClosesPreview(closesAt, now)).toMatch(/in 47 min/)
  })
})
