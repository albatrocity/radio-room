import { describe, expect, it } from "vitest"
import { getNextShowTime } from "./dates"

describe("getNextShowTime", () => {
  it("includes the third Thursday itself in America/Chicago", () => {
    // Thursday Aug 20, 2026 11:00 AM CDT — show night
    expect(getNextShowTime(new Date("2026-08-20T11:00:00-05:00"))).toBe(
      "August 20, 2026 at 8:00 PM",
    )
  })

  it("still includes show night after 8:00 PM Chicago time that day", () => {
    expect(getNextShowTime(new Date("2026-08-20T22:30:00-05:00"))).toBe(
      "August 20, 2026 at 8:00 PM",
    )
  })

  it("uses the Chicago calendar day, not the viewer's local date", () => {
    // Friday Aug 21 03:00 UTC is still Thursday Aug 20 10:00 PM CDT
    expect(getNextShowTime(new Date("2026-08-21T03:00:00Z"))).toBe(
      "August 20, 2026 at 8:00 PM",
    )
  })

  it("moves to next month after the Chicago calendar day has passed", () => {
    // Friday Aug 21, 2026 12:01 AM CDT
    expect(getNextShowTime(new Date("2026-08-21T00:01:00-05:00"))).toBe(
      "September 17, 2026 at 8:00 PM",
    )
  })

  it("returns this month's show when today is before the third Thursday", () => {
    expect(getNextShowTime(new Date("2026-08-01T12:00:00-05:00"))).toBe(
      "August 20, 2026 at 8:00 PM",
    )
  })

  it("rolls into January when December's third Thursday has passed", () => {
    expect(getNextShowTime(new Date("2026-12-18T00:00:00-06:00"))).toBe(
      "January 21, 2027 at 8:00 PM",
    )
  })
})
