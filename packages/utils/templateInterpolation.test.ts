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

describe("interpolateTemplate sessionMs:duration", () => {
  test("matches loyalty-style placeholders", () => {
    expect(
      interpolateTemplate("{{sessionMs:duration}}", { sessionMs: 2500 }),
    ).toBe("3 seconds")
  })
})
