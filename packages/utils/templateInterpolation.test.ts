import { describe, expect, test } from "vitest"
import { formatValue, interpolateTemplate } from "./templateInterpolation"

describe("formatValue duration", () => {
  test("rounds milliseconds up to whole seconds before formatting", () => {
    expect(formatValue(2500, "duration")).toBe("3 seconds")
    expect(formatValue(1, "duration")).toBe("1 second")
    expect(formatValue(1000, "duration")).toBe("1 second")
    expect(formatValue(1001, "duration")).toBe("2 seconds")
  })

  test("minute breakdown uses ceiling seconds", () => {
    expect(formatValue(59_999, "duration")).toBe("1 minute")
    expect(formatValue(61_000, "duration")).toBe("1m 1s")
    expect(formatValue(62_000, "duration")).toBe("1m 2s")
  })
})

describe("formatValue mmss", () => {
  test("formats milliseconds as m:ss", () => {
    expect(formatValue(83_000, "mmss")).toBe("1:23")
    expect(formatValue(60_000, "mmss")).toBe("1:00")
    expect(formatValue(59_000, "mmss")).toBe("0:59")
    expect(formatValue(1_000, "mmss")).toBe("0:01")
  })

  test("rounds up partial seconds", () => {
    expect(formatValue(83_001, "mmss")).toBe("1:24")
  })
})

describe("interpolateTemplate skipAmountMs:mmss", () => {
  test("interpolates skip amount in compact time format", () => {
    expect(
      interpolateTemplate(
        "The last {{skipAmountMs:mmss}} of this track will be skipped",
        { skipAmountMs: 83_000 },
      ),
    ).toBe("The last 1:23 of this track will be skipped")
  })
})

describe("interpolateTemplate sessionMs:duration", () => {
  test("matches loyalty-style placeholders", () => {
    expect(interpolateTemplate("{{sessionMs:duration}}", { sessionMs: 2500 })).toBe("3 seconds")
  })
})
