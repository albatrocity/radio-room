import { describe, expect, it } from "vitest"
import {
  computeEconomyMetrics,
  computeWealth,
  DEFAULT_ECONOMY_POLICY,
  nextCostScale,
  type EconomyControllerPolicy,
  type EconomySample,
} from "./economyController"

const policy: EconomyControllerPolicy = { ...DEFAULT_ECONOMY_POLICY }

function sample(overrides: Partial<EconomySample> = {}): EconomySample {
  return {
    balances: [30, 30, 30],
    basketPrice: 10,
    costScale: 1,
    earnScale: 1,
    elapsedMs: 60_000,
    netCoinFlow: 0,
    ...overrides,
  }
}

describe("computeWealth", () => {
  it("uses median so one whale does not tax the room", () => {
    const balances = [10, 12, 11, 1000]
    expect(computeWealth(balances, "median")).toBe(11.5)
    expect(computeWealth(balances, "mean")).toBeGreaterThan(200)
  })
})

describe("computeEconomyMetrics", () => {
  it("reports affordability as M / (P0 * s)", () => {
    const m = computeEconomyMetrics(sample({ balances: [30, 30, 30], basketPrice: 10, costScale: 1 }), policy)
    expect(m.wealth).toBe(30)
    expect(m.affordability).toBe(3)
    expect(m.targetCostScale).toBe(1)
  })
})

describe("nextCostScale", () => {
  it("holds inside the ±15% deadband", () => {
    // R = 30 / (10 * 1) = 3; R* = 3 → deadband
    const result = nextCostScale(sample(), policy, { costScale: 1, emaWealth: 30 })
    expect(result.acted).toBe(false)
    expect(result.reason).toBe("deadband")
    expect(result.costScale).toBe(1)
  })

  it("acts outside the deadband", () => {
    // M = 90 → R = 9, well above 3
    const result = nextCostScale(
      sample({ balances: [90, 90, 90] }),
      policy,
      { costScale: 1, emaWealth: 90 },
    )
    expect(result.acted).toBe(true)
    expect(result.costScale).toBeGreaterThan(1)
  })

  it("never exceeds ±10% in a single tick", () => {
    const result = nextCostScale(
      sample({ balances: [10_000, 10_000, 10_000] }),
      policy,
      { costScale: 1, emaWealth: 10_000 },
    )
    expect(result.costScale).toBeLessThanOrEqual(1.1 + 1e-9)
    expect(result.costScale / 1).toBeCloseTo(1.1, 8)
  })

  it("clamps at minCostScale / maxCostScale", () => {
    const tight: EconomyControllerPolicy = { ...policy, minCostScale: 1, maxCostScale: 1.05 }
    let scale = 1
    let ema: number | null = 10_000
    for (let i = 0; i < 20; i++) {
      const result = nextCostScale(
        sample({ balances: [10_000, 10_000, 10_000], costScale: scale }),
        tight,
        { costScale: scale, emaWealth: ema },
      )
      scale = result.costScale
      ema = result.emaWealth
    }
    expect(scale).toBeLessThanOrEqual(1.05 + 1e-9)
  })

  it("converges monotonically toward s* with no overshoot (~10 ticks)", () => {
    const M = 60
    const P0 = 10
    const R = 3
    const sStar = M / (P0 * R) // 2
    let scale = 1
    let ema: number | null = M
    const path: number[] = [scale]
    for (let i = 0; i < 10; i++) {
      const result = nextCostScale(
        sample({ balances: [M, M, M], costScale: scale }),
        policy,
        { costScale: scale, emaWealth: ema },
      )
      expect(result.costScale).toBeGreaterThanOrEqual(scale - 1e-12)
      expect(result.costScale).toBeLessThanOrEqual(sStar + 1e-9)
      scale = result.costScale
      ema = result.emaWealth
      path.push(scale)
    }
    expect(scale).toBeGreaterThan(1.5)
    expect(path.every((s, i) => i === 0 || s >= path[i - 1]! - 1e-12)).toBe(true)
  })

  it("stays bounded in a closed loop where spending rises with prices", () => {
    let M = 90
    let scale = 1
    let ema: number | null = M
    const logs: number[] = []
    const P0 = 10
    for (let i = 0; i < 40; i++) {
      const result = nextCostScale(
        sample({ balances: [M, M, M], costScale: scale }),
        policy,
        { costScale: scale, emaWealth: ema },
      )
      // Players buy ~1 typical item per tick at the live price.
      M = Math.max(0, M - P0 * result.costScale)
      scale = result.costScale
      ema = result.emaWealth
      logs.push(Math.log(scale))
    }
    const maxLn = Math.max(...logs)
    const minLn = Math.min(...logs)
    expect(maxLn - minLn).toBeLessThan(Math.log(8))
    const lastHalf = logs.slice(20)
    const firstHalf = logs.slice(0, 20)
    const amp = (arr: number[]) => Math.max(...arr) - Math.min(...arr)
    expect(amp(lastHalf)).toBeLessThanOrEqual(amp(firstHalf) + 0.05)
  })

  it("holds below minParticipants and when P0 = 0", () => {
    const few = nextCostScale(
      sample({ balances: [100, 100] }),
      policy,
      { costScale: 1, emaWealth: 100 },
    )
    expect(few.acted).toBe(false)
    expect(few.reason).toBe("min_participants")

    const noBasket = nextCostScale(
      sample({ basketPrice: 0, balances: [100, 100, 100] }),
      policy,
      { costScale: 1, emaWealth: 100 },
    )
    expect(noBasket.acted).toBe(false)
    expect(noBasket.reason).toBe("zero_basket")
  })
})
