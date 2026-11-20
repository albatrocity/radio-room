import { describe, expect, it } from "vitest"
import { getNextShowTime, nextUpcomingReadyShowTime } from "./dates"

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

describe("nextUpcomingReadyShowTime", () => {
  const readyShows = [
    { startTime: "2026-11-19T02:00:00.000Z" }, // Wed Nov 18, 2026 8:00 PM CST
    { startTime: "2026-04-05T01:10:00.000Z" }, // past
    { startTime: null },
    { startTime: "not-a-date" },
  ]

  it("uses the earliest ready show still on today's Chicago calendar day or later", () => {
    expect(nextUpcomingReadyShowTime(readyShows, new Date("2026-11-11T15:00:00-06:00"))).toBe(
      "November 18, 2026 at 8:00 PM",
    )
  })

  it("keeps that show through Chicago show night after the start time", () => {
    expect(nextUpcomingReadyShowTime(readyShows, new Date("2026-11-18T21:30:00-06:00"))).toBe(
      "November 18, 2026 at 8:00 PM",
    )
  })

  it("returns null once that Chicago calendar day has passed", () => {
    expect(nextUpcomingReadyShowTime(readyShows, new Date("2026-11-19T00:01:00-06:00"))).toBeNull()
  })

  it("picks the earlier of two upcoming ready shows", () => {
    expect(
      nextUpcomingReadyShowTime(
        [...readyShows, { startTime: "2026-12-17T02:00:00.000Z" }],
        new Date("2026-11-11T15:00:00-06:00"),
      ),
    ).toBe("November 18, 2026 at 8:00 PM")
  })

  it("formats the show's Chicago start time", () => {
    expect(
      nextUpcomingReadyShowTime(
        [{ startTime: "2026-11-19T01:30:00.000Z" }],
        new Date("2026-11-11T15:00:00-06:00"),
      ),
    ).toBe("November 18, 2026 at 7:30 PM")
  })
})
