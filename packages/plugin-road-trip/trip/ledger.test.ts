import { describe, expect, it } from "vitest"
import {
  MS_PER_HOUR,
  nextLeg,
  project,
  ratesChanged,
  timeToGallonsUsed,
  timeToMile,
} from "./ledger"

const drive = { mph: 60, gpm: 0, engine: true }
const stop = { mph: 0, gpm: 0, engine: true }

describe("ledger", () => {
  it("starts at mile 0 and projects linearly", () => {
    const leg = nextLeg(null, 1_000, drive, "start")
    expect(leg).toMatchObject({ at: 1_000, mile: 0, gallonsUsed: 0, mph: 60 })
    expect(project(leg, 1_000 + MS_PER_HOUR / 2).mile).toBe(30)
  })

  it("never projects before the leg start", () => {
    const leg = nextLeg(null, 10_000, drive, "start")
    expect(project(leg, 0).mile).toBe(0)
  })

  it("carries prefix sums across legs", () => {
    const l0 = nextLeg(null, 0, drive, "start")
    const l1 = nextLeg(l0, MS_PER_HOUR / 4, stop, "blocker-on", "park:a")
    const l2 = nextLeg(l1, MS_PER_HOUR, drive, "blocker-off")
    expect(l1.mile).toBe(15)
    expect(l1.ref).toBe("park:a")
    expect(l2.mile).toBe(15)
    expect(project(l2, MS_PER_HOUR * 1.5).mile).toBe(45)
  })

  it("integrates fuel per leg when mpg changes mid-trip", () => {
    const l0 = nextLeg(null, 0, { mph: 60, gpm: 1 / 20, engine: true }, "start")
    const l1 = nextLeg(l0, MS_PER_HOUR, { mph: 60, gpm: 1 / 10, engine: true }, "factor-on")
    expect(l1.mile).toBe(60)
    expect(l1.gallonsUsed).toBe(3)
    expect(project(l1, 2 * MS_PER_HOUR)).toEqual({ mile: 120, gallonsUsed: 9 })
  })

  it("solves time to a mile only while moving and ahead", () => {
    const leg = nextLeg(null, 0, drive, "start")
    expect(timeToMile(leg, 30)).toBe(MS_PER_HOUR / 2)
    expect(timeToMile(leg, 0)).toBeNull()
    expect(timeToMile(nextLeg(null, 0, stop, "start"), 10)).toBeNull()
  })

  it("solves time to a fuel threshold only while burning", () => {
    const leg = nextLeg(null, 0, { mph: 60, gpm: 1 / 20, engine: true }, "start")
    expect(timeToGallonsUsed(leg, 3)).toBe(MS_PER_HOUR)
    expect(timeToGallonsUsed(nextLeg(null, 0, drive, "start"), 1)).toBeNull()
  })

  it("detects rate changes", () => {
    const leg = nextLeg(null, 0, drive, "start")
    expect(ratesChanged(null, drive)).toBe(true)
    expect(ratesChanged(leg, drive)).toBe(false)
    expect(ratesChanged(leg, stop)).toBe(true)
    expect(ratesChanged(leg, { ...drive, engine: false })).toBe(true)
  })
})
