import { describe, expect, it } from "vitest"
import {
  clampCostScale,
  clampEarnScale,
  COST_SCALE_MAX,
  COST_SCALE_MIN,
  defaultEconomyScaleState,
  EARN_SCALE_MAX,
  EARN_SCALE_MIN,
  resolveEconomy,
  roundTo,
  scalePrice,
  scaleReward,
} from "./economyScale"

describe("roundTo", () => {
  it("rounds to nearest 1", () => {
    expect(roundTo(37.4, 1)).toBe(37)
    expect(roundTo(37.5, 1)).toBe(38)
  })

  it("rounds to nearest 5", () => {
    expect(roundTo(37, 5)).toBe(35)
    expect(roundTo(38, 5)).toBe(40)
  })
})

describe("scalePrice", () => {
  it("returns non-positive bases unchanged", () => {
    expect(scalePrice(0, 2)).toBe(0)
    expect(scalePrice(-5, 2)).toBe(-5)
  })

  it("floors positive results at 1 so nothing becomes free", () => {
    expect(scalePrice(1, 0.25)).toBe(1)
    expect(scalePrice(2, 0.25)).toBe(1)
  })

  it("applies rounding modes", () => {
    expect(scalePrice(10, 1.2, 1)).toBe(12)
    expect(scalePrice(10, 3.7, 5)).toBe(35)
  })
})

describe("scaleReward", () => {
  const economy = defaultEconomyScaleState(0)

  it("bypasses on intent exact", () => {
    expect(scaleReward(10, "coin", { ...economy, earnScale: 2 }, "exact")).toBe(10)
  })

  it("leaves non-scaled attributes untouched", () => {
    expect(scaleReward(10, "score", { ...economy, earnScale: 2 }, "earn")).toBe(10)
  })

  it("leaves negative and zero deltas untouched", () => {
    expect(scaleReward(-35, "coin", { ...economy, earnScale: 2 })).toBe(-35)
    expect(scaleReward(0, "coin", { ...economy, earnScale: 2 })).toBe(0)
  })

  it("scales positive coin rewards and floors at 1", () => {
    expect(scaleReward(10, "coin", { ...economy, earnScale: 2 })).toBe(20)
    expect(scaleReward(1, "coin", { ...economy, earnScale: 0.25 })).toBe(1)
  })
})

describe("resolveEconomy", () => {
  it("treats undefined as identity", () => {
    const resolved = resolveEconomy(undefined)
    expect(resolved.costScale).toBe(1)
    expect(resolved.earnScale).toBe(1)
    expect(resolved.scaledAttributes).toEqual(["coin"])
    expect(resolved.priceRounding).toBe(1)
  })

  it("fills missing fields on a partial blob", () => {
    const resolved = resolveEconomy({
      costScale: 2,
      earnScale: 0.5,
      scaledAttributes: [],
      priceRounding: 0,
      updatedAt: 1,
    })
    expect(resolved.costScale).toBe(2)
    expect(resolved.earnScale).toBe(0.5)
    expect(resolved.scaledAttributes).toEqual(["coin"])
    expect(resolved.priceRounding).toBe(1)
  })
})

describe("clamp", () => {
  it("clamps cost and earn to the documented ranges", () => {
    expect(clampCostScale(0)).toBe(COST_SCALE_MIN)
    expect(clampCostScale(99)).toBe(COST_SCALE_MAX)
    expect(clampEarnScale(0)).toBe(EARN_SCALE_MIN)
    expect(clampEarnScale(99)).toBe(EARN_SCALE_MAX)
    expect(clampCostScale(Number.NaN)).toBe(1)
  })
})
