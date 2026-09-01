import { describe, it, expect } from "vitest"
import { aggregateTrackStats, type TrackStatsAggregateRow } from "./aggregateTrackStats"

function row(
  overrides: Partial<TrackStatsAggregateRow> & Pick<TrackStatsAggregateRow, "showId" | "showTitle">,
): TrackStatsAggregateRow {
  return {
    addedAt: new Date("2024-06-01T20:00:00.000Z"),
    playedAt: null,
    showStartTime: new Date("2024-06-01T19:00:00.000Z"),
    addedByUsername: "Ross",
    ...overrides,
  }
}

describe("aggregateTrackStats", () => {
  it("returns first-play payload for empty input", () => {
    expect(aggregateTrackStats([])).toEqual({
      firstPlay: true,
      showCount: 0,
      appearanceCount: 0,
      firstAppearance: null,
      recentAppearances: [],
      topDjs: [],
    })
  })

  it("counts distinct shows and total appearances", () => {
    const stats = aggregateTrackStats([
      row({ showId: "s1", showTitle: "Show A" }),
      row({ showId: "s1", showTitle: "Show A", addedAt: new Date("2024-06-02T20:00:00.000Z") }),
      row({ showId: "s2", showTitle: "Show B", addedAt: new Date("2024-06-03T20:00:00.000Z") }),
    ])
    expect(stats.firstPlay).toBe(false)
    expect(stats.showCount).toBe(2)
    expect(stats.appearanceCount).toBe(3)
  })

  it("returns last 5 distinct shows newest first", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({
        showId: `s${i}`,
        showTitle: `Show ${i}`,
        addedAt: new Date(`2024-06-0${i + 1}T20:00:00.000Z`),
      }),
    )
    const stats = aggregateTrackStats(rows)
    expect(stats.recentAppearances).toHaveLength(5)
    expect(stats.recentAppearances[0]?.showTitle).toBe("Show 6")
    expect(stats.recentAppearances[4]?.showTitle).toBe("Show 2")
  })

  it("dedupes double-add in one show for recent list", () => {
    const stats = aggregateTrackStats([
      row({
        showId: "s1",
        showTitle: "Show A",
        addedAt: new Date("2024-06-02T20:00:00.000Z"),
        addedByUsername: "Later DJ",
      }),
      row({
        showId: "s1",
        showTitle: "Show A",
        addedAt: new Date("2024-06-01T20:00:00.000Z"),
        addedByUsername: "Earlier DJ",
      }),
    ])
    expect(stats.recentAppearances).toHaveLength(1)
    expect(stats.recentAppearances[0]?.addedByUsername).toBe("Later DJ")
  })

  it("uses Unknown DJ when username missing", () => {
    const stats = aggregateTrackStats([
      row({ showId: "s1", showTitle: "Show A", addedByUsername: null }),
    ])
    expect(stats.recentAppearances[0]?.addedByUsername).toBe("Unknown DJ")
    expect(stats.topDjs[0]).toEqual({ username: "Unknown DJ", count: 1 })
  })

  it("picks earliest firstAppearance by coalesced timestamp", () => {
    const stats = aggregateTrackStats([
      row({
        showId: "s2",
        showTitle: "Later show",
        addedAt: new Date("2024-07-01T20:00:00.000Z"),
      }),
      row({
        showId: "s1",
        showTitle: "Earlier show",
        addedAt: new Date("2024-05-01T20:00:00.000Z"),
      }),
    ])
    expect(stats.firstAppearance?.showTitle).toBe("Earlier show")
  })

  it("falls back to playedAt then showStartTime for ordering", () => {
    const stats = aggregateTrackStats([
      row({
        showId: "s1",
        showTitle: "Played",
        addedAt: null,
        playedAt: new Date("2024-04-01T21:00:00.000Z"),
      }),
      row({
        showId: "s2",
        showTitle: "Start only",
        addedAt: null,
        playedAt: null,
        showStartTime: new Date("2024-03-01T19:00:00.000Z"),
      }),
    ])
    expect(stats.firstAppearance?.showTitle).toBe("Start only")
    expect(stats.recentAppearances[0]?.showTitle).toBe("Played")
  })

  it("ranks top DJs by appearance count", () => {
    const stats = aggregateTrackStats([
      row({ showId: "s1", showTitle: "A", addedByUsername: "Alice" }),
      row({ showId: "s2", showTitle: "B", addedByUsername: "Alice" }),
      row({ showId: "s3", showTitle: "C", addedByUsername: "Bob" }),
    ])
    expect(stats.topDjs).toEqual([
      { username: "Alice", count: 2 },
      { username: "Bob", count: 1 },
    ])
  })
})
