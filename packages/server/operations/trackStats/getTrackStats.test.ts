import { describe, expect, it } from "vitest"
import { trackStatsTimestampToIso } from "./getTrackStats"

describe("trackStatsTimestampToIso", () => {
  it("formats Date values", () => {
    expect(trackStatsTimestampToIso(new Date("2024-06-01T20:00:00.000Z"))).toBe(
      "2024-06-01T20:00:00.000Z",
    )
  })

  it("parses Postgres timestamptz text from drizzle sql expressions", () => {
    expect(trackStatsTimestampToIso("2026-10-12 22:06:20.145901+00")).toBe(
      "2026-10-12T22:06:20.145Z",
    )
  })

  it("parses ISO strings", () => {
    expect(trackStatsTimestampToIso("2024-06-01T20:00:00.000Z")).toBe("2024-06-01T20:00:00.000Z")
  })

  it("rejects unparseable timestamps", () => {
    expect(() => trackStatsTimestampToIso("not-a-date")).toThrow(TypeError)
  })
})
