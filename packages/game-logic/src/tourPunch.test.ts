import { describe, expect, it } from "vitest"
import {
  TOUR_LAMINATE_PUNCH_COUNT_KEY,
  TOUR_LAMINATE_PUNCH_HISTORY_LIMIT,
  TOUR_LAMINATE_PUNCHES_KEY,
  type TourPunch,
} from "@repo/types"
import {
  DEFAULT_PUNCH_COUNT_NOUN,
  TOUR_PUNCH_COIN_LADDER,
  coinsForPunchNumber,
  currentTourStreak,
  formatPunchCount,
  planTourPunch,
  readTourPunchCount,
  readTourPunches,
  resolvePunchCountNoun,
  tourPunchKey,
} from "./tourPunch"

const base = {
  existing: [] as TourPunch[],
  existingCount: 0,
  at: 1_000,
}

describe("coinsForPunchNumber", () => {
  it("follows the authored ladder and clamps at 80", () => {
    expect(TOUR_PUNCH_COIN_LADDER).toEqual([5, 10, 20, 35, 55, 80])
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(coinsForPunchNumber)).toEqual([
      5, 10, 20, 35, 55, 80, 80, 80,
    ])
  })
})

describe("tourPunchKey", () => {
  it("prefers showId and falls back to sessionId", () => {
    expect(tourPunchKey("show-1", "sess-1")).toBe("show:show-1")
    expect(tourPunchKey(null, "sess-1")).toBe("session:sess-1")
    expect(tourPunchKey(undefined, undefined)).toBeNull()
    expect(tourPunchKey("  ", "  ")).toBeNull()
  })
})

describe("planTourPunch", () => {
  it("returns null when there is no key", () => {
    expect(planTourPunch({ ...base, showId: null, sessionId: null })).toBeNull()
  })

  it("stamps holder identity onto the punch", () => {
    const result = planTourPunch({
      ...base,
      sessionId: "sess-1",
      label: "Game Studio",
      holderUserId: "u-ross",
      holderUsername: "Ross",
    })
    expect(result?.punch).toMatchObject({
      key: "session:sess-1",
      coins: 5,
      label: "Game Studio",
      holderUserId: "u-ross",
      holderUsername: "Ross",
    })
    expect(result?.nextCount).toBe(1)
  })

  it("dedupes by key, by showId, and by sessionId", () => {
    const first = planTourPunch({
      ...base,
      showId: "show-1",
      sessionId: "sess-1",
    })
    expect(first).not.toBeNull()
    expect(
      planTourPunch({
        existing: first!.nextHistory,
        existingCount: first!.nextCount,
        at: 2_000,
        showId: "show-1",
        sessionId: "sess-2",
      }),
    ).toBeNull()
    expect(
      planTourPunch({
        existing: first!.nextHistory,
        existingCount: first!.nextCount,
        at: 2_000,
        sessionId: "sess-1",
      }),
    ).toBeNull()
  })

  it("trims history at 25 while count keeps climbing", () => {
    let existing: TourPunch[] = []
    let count = 0
    for (let i = 0; i < TOUR_LAMINATE_PUNCH_HISTORY_LIMIT + 3; i++) {
      const result = planTourPunch({
        existing,
        existingCount: count,
        at: 1_000 + i,
        sessionId: `sess-${i}`,
      })
      expect(result).not.toBeNull()
      existing = result!.nextHistory
      count = result!.nextCount
    }
    expect(existing).toHaveLength(TOUR_LAMINATE_PUNCH_HISTORY_LIMIT)
    expect(count).toBe(TOUR_LAMINATE_PUNCH_HISTORY_LIMIT + 3)
    expect(existing[0]?.key).toBe("session:sess-3")
    expect(existing.at(-1)?.coins).toBe(80)
  })
})

describe("readTourPunches / readTourPunchCount", () => {
  it("reads absent or garbage metadata as empty / zero", () => {
    expect(readTourPunches({})).toEqual([])
    expect(readTourPunches({ metadata: { [TOUR_LAMINATE_PUNCHES_KEY]: "nope" } })).toEqual([])
    expect(readTourPunchCount({})).toBe(0)
    expect(readTourPunchCount({ metadata: { [TOUR_LAMINATE_PUNCH_COUNT_KEY]: "nope" } })).toBe(0)
    expect(readTourPunchCount({ metadata: { [TOUR_LAMINATE_PUNCH_COUNT_KEY]: -1 } })).toBe(0)
  })
})

describe("currentTourStreak", () => {
  it("counts newest-backwards punches within the monthly gap", () => {
    const day = 24 * 60 * 60 * 1000
    const punches: TourPunch[] = [
      { key: "a", at: 0, coins: 5 },
      { key: "b", at: 30 * day, coins: 10 },
      { key: "c", at: 90 * day, coins: 20 },
    ]
    expect(currentTourStreak(punches)).toBe(1)
    expect(
      currentTourStreak([
        { key: "a", at: 0, coins: 5 },
        { key: "b", at: 30 * day, coins: 10 },
      ]),
    ).toBe(2)
  })
})

describe("formatPunchCount", () => {
  it("uses show/shows by default and honors a custom noun", () => {
    const shows = resolvePunchCountNoun(undefined)
    expect(formatPunchCount(0, shows)).toBe("No shows")
    expect(formatPunchCount(1, shows)).toBe("1 show")
    expect(formatPunchCount(4, shows)).toBe("4 shows")
    expect(resolvePunchCountNoun({ countNoun: { singular: "  gig ", plural: "gigs" } })).toEqual({
      singular: "gig",
      plural: "gigs",
    })
    expect(resolvePunchCountNoun({ countNoun: { singular: " ", plural: "gigs" } })).toEqual(
      DEFAULT_PUNCH_COUNT_NOUN,
    )
  })
})
