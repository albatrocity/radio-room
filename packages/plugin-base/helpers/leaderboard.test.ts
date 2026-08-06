import { describe, expect, test, vi } from "vitest"
import { fetchTopZsetEntries, HOT_LEADERBOARD_TOP_N } from "./leaderboard"

describe("fetchTopZsetEntries", () => {
  test("exports HOT_LEADERBOARD_TOP_N = 25", () => {
    expect(HOT_LEADERBOARD_TOP_N).toBe(25)
  })

  test("returns [] when topN <= 0 without calling storage", async () => {
    const zrangeWithScores = vi.fn()
    await expect(fetchTopZsetEntries({ zrangeWithScores }, "lb", 0)).resolves.toEqual([])
    await expect(fetchTopZsetEntries({ zrangeWithScores }, "lb", -1)).resolves.toEqual([])
    expect(zrangeWithScores).not.toHaveBeenCalled()
  })

  test("requests ascending tail and returns highest-score-first", async () => {
    const zrangeWithScores = vi.fn().mockResolvedValue([
      { score: 2, value: "b" },
      { score: 5, value: "a" },
    ])
    const result = await fetchTopZsetEntries({ zrangeWithScores }, "scores", 25)
    expect(zrangeWithScores).toHaveBeenCalledWith("scores", -25, -1)
    expect(result).toEqual([
      { score: 5, value: "a" },
      { score: 2, value: "b" },
    ])
  })
})
