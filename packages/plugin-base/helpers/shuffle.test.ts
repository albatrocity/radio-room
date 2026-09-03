import { describe, expect, test } from "vitest"
import { sampleN, shuffleInPlace } from "./shuffle"

describe("shuffleInPlace", () => {
  test("is deterministic with an injected rng", () => {
    const items = ["a", "b", "c"]
    expect(shuffleInPlace(items, () => 0)).toEqual(["b", "c", "a"])
  })
})

describe("sampleN", () => {
  test("returns [] for empty pool or non-positive count", () => {
    expect(sampleN(["a"], 0)).toEqual([])
    expect(sampleN([], 2)).toEqual([])
  })

  test("caps at pool length", () => {
    expect(sampleN(["a", "b"], 5, () => 0)).toEqual(["b", "a"])
  })

  test("is deterministic with an injected rng", () => {
    expect(sampleN(["a", "b", "c"], 2, () => 0)).toEqual(["b", "c"])
  })
})
