import { describe, expect, it } from "vitest"
import { formatMsAsClock, parseClockDurationToMs } from "./durationClock"

describe("formatMsAsClock", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatMsAsClock(0)).toBe("0:00")
    expect(formatMsAsClock(180_000)).toBe("3:00")
    expect(formatMsAsClock(83_000)).toBe("1:23")
  })

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatMsAsClock(3_600_000)).toBe("1:00:00")
    expect(formatMsAsClock(3_661_000)).toBe("1:01:01")
  })
})

describe("parseClockDurationToMs", () => {
  it("parses m:ss and mm:ss", () => {
    expect(parseClockDurationToMs("3:00")).toBe(180_000)
    expect(parseClockDurationToMs("03:05")).toBe(185_000)
    expect(parseClockDurationToMs("0:45")).toBe(45_000)
  })

  it("parses h:mm:ss", () => {
    expect(parseClockDurationToMs("1:00:00")).toBe(3_600_000)
    expect(parseClockDurationToMs("1:01:01")).toBe(3_661_000)
  })

  it("parses bare seconds", () => {
    expect(parseClockDurationToMs("180")).toBe(180_000)
  })

  it("returns null for incomplete or invalid input", () => {
    expect(parseClockDurationToMs("")).toBeNull()
    expect(parseClockDurationToMs("3:")).toBeNull()
    expect(parseClockDurationToMs(":30")).toBeNull()
    expect(parseClockDurationToMs("3:60")).toBeNull()
    expect(parseClockDurationToMs("1:60:00")).toBeNull()
    expect(parseClockDurationToMs("abc")).toBeNull()
  })
})
