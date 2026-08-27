import { describe, expect, it } from "vitest"
import { mapWithConcurrency } from "./concurrency"

describe("mapWithConcurrency", () => {
  it("preserves order with a limit below item count", async () => {
    const seen: number[] = []
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n)
      return n * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it("returns empty for an empty list", async () => {
    await expect(mapWithConcurrency([], 8, async (n: number) => n)).resolves.toEqual([])
  })
})
