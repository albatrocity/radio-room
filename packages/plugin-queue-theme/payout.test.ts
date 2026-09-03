import { describe, expect, it } from "vitest"
import {
  computeDjPayout,
  parseNonNegInt,
  parseTruthyParam,
  sampleUserIds,
  tallyThemeVotes,
} from "./payout"

describe("computeDjPayout", () => {
  it("pays max(0, yes - no) * rate", () => {
    expect(computeDjPayout({ yesCount: 5, noCount: 2, coinPerNetVote: 1 })).toBe(3)
    expect(computeDjPayout({ yesCount: 2, noCount: 5, coinPerNetVote: 1 })).toBe(0)
    expect(computeDjPayout({ yesCount: 4, noCount: 1, coinPerNetVote: 2 })).toBe(6)
  })
})

describe("tallyThemeVotes", () => {
  it("excludes the DJ and counts decoy voters", () => {
    const result = tallyThemeVotes({
      votes: {
        dj: "yes-id",
        a: "yes-id",
        b: "no-id",
        c: "decoy-id",
      },
      optionIds: { yes: "yes-id", no: "no-id", decoy: "decoy-id" },
      excludeUserId: "dj",
    })
    expect(result).toEqual({
      yesCount: 1,
      noCount: 1,
      decoyCount: 1,
      decoyVoterIds: ["c"],
    })
  })
})

describe("parse helpers", () => {
  it("parseTruthyParam", () => {
    expect(parseTruthyParam("true")).toBe(true)
    expect(parseTruthyParam("false")).toBe(false)
    expect(parseTruthyParam(1)).toBe(true)
  })

  it("parseNonNegInt", () => {
    expect(parseNonNegInt("3")).toBe(3)
    expect(parseNonNegInt("-2")).toBe(0)
    expect(parseNonNegInt(undefined, 1)).toBe(1)
  })

  it("sampleUserIds is deterministic with an injected rng", () => {
    expect(sampleUserIds(["a", "b", "c"], 2, () => 0)).toEqual(["b", "c"])
    expect(sampleUserIds(["a", "b", "c"], 0, () => 0)).toEqual([])
  })
})
