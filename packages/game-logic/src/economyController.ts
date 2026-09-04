import { clampCostScale, COST_SCALE_MAX, COST_SCALE_MIN } from "./economyScale"

export type WealthStatistic = "median" | "mean" | "trimmedMean"

export interface EconomyControllerPolicy {
  targetAffordability: number
  wealthStatistic: WealthStatistic
  /** Geometric smoothing α in log space. */
  smoothing: number
  /** Hold when |ln(R/R*)| < ln(1 + deadband). */
  deadband: number
  /** Max multiplicative step per tick (0.10 = ±10%). */
  maxStepPct: number
  minCostScale: number
  maxCostScale: number
  minParticipants: number
  /** EMA λ for the wealth measurement. Default 0.3. */
  emaLambda?: number
}

export interface EconomyControllerPrev {
  costScale: number
  emaWealth: number | null
}

export interface EconomySample {
  balances: number[]
  basketPrice: number
  costScale: number
  earnScale: number
  elapsedMs: number
  /** Sum of coin deltas (positive and negative) since the previous tick. */
  netCoinFlow: number
}

export interface EconomyMetrics {
  wealth: number
  affordability: number
  targetCostScale: number
  flowRatio: number
}

export const DEFAULT_ECONOMY_POLICY: EconomyControllerPolicy = {
  targetAffordability: 3,
  wealthStatistic: "median",
  smoothing: 0.25,
  deadband: 0.15,
  maxStepPct: 0.1,
  minCostScale: COST_SCALE_MIN,
  maxCostScale: COST_SCALE_MAX,
  minParticipants: 3,
  emaLambda: 0.3,
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export function trimmedMean(values: readonly number[]): number {
  if (values.length < 3) return mean(values)
  const sorted = [...values].sort((a, b) => a - b)
  return mean(sorted.slice(1, -1))
}

export function computeWealth(
  balances: readonly number[],
  statistic: WealthStatistic = "median",
): number {
  if (statistic === "mean") return mean(balances)
  if (statistic === "trimmedMean") return trimmedMean(balances)
  return median(balances)
}

function safePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function computeEconomyMetrics(sample: EconomySample, policy: EconomyControllerPolicy): EconomyMetrics {
  const wealth = computeWealth(sample.balances, policy.wealthStatistic)
  const basket = safePositive(sample.basketPrice, 0)
  const costScale = safePositive(sample.costScale, 1)
  const denom = basket * costScale
  const affordability = denom > 0 ? wealth / denom : 0
  const target =
    basket > 0 && policy.targetAffordability > 0
      ? wealth / (basket * policy.targetAffordability)
      : costScale
  const n = sample.balances.length
  const minutes = sample.elapsedMs > 0 ? sample.elapsedMs / 60_000 : 0
  const flowPerCapita =
    n > 0 && minutes > 0 ? sample.netCoinFlow / n / minutes : 0
  const flowRatio = denom > 0 ? flowPerCapita / denom : 0
  return {
    wealth,
    affordability,
    targetCostScale: target,
    flowRatio,
  }
}

export type NextCostScaleReason =
  | "min_participants"
  | "zero_basket"
  | "deadband"
  | "adjusted"

export interface NextCostScaleResult {
  costScale: number
  emaWealth: number
  acted: boolean
  reason: NextCostScaleReason
  metrics: EconomyMetrics
}

/**
 * One tick of the log-space proportional controller. Zero I/O, zero clock.
 */
export function nextCostScale(
  sample: EconomySample,
  policy: EconomyControllerPolicy,
  prev: EconomyControllerPrev,
): NextCostScaleResult {
  const lambda = policy.emaLambda ?? 0.3
  const wealth = computeWealth(sample.balances, policy.wealthStatistic)
  const emaWealth =
    prev.emaWealth == null ? wealth : (1 - lambda) * prev.emaWealth + lambda * wealth
  const metrics = computeEconomyMetrics(
    { ...sample, balances: sample.balances.map(() => emaWealth) },
    policy,
  )
  // Restore the raw (non-EMA) wealth on the public metrics object.
  const publicMetrics = computeEconomyMetrics(sample, policy)
  publicMetrics.targetCostScale = metrics.targetCostScale
  publicMetrics.affordability =
    sample.basketPrice > 0 && sample.costScale > 0
      ? emaWealth / (sample.basketPrice * sample.costScale)
      : publicMetrics.affordability

  const current = safePositive(sample.costScale, 1)
  const minS = Math.max(COST_SCALE_MIN, policy.minCostScale)
  const maxS = Math.min(COST_SCALE_MAX, policy.maxCostScale)

  if (sample.balances.length < policy.minParticipants) {
    return {
      costScale: current,
      emaWealth,
      acted: false,
      reason: "min_participants",
      metrics: publicMetrics,
    }
  }
  if (!(sample.basketPrice > 0)) {
    return {
      costScale: current,
      emaWealth,
      acted: false,
      reason: "zero_basket",
      metrics: publicMetrics,
    }
  }

  const rStar = safePositive(policy.targetAffordability, 3)
  const r = sample.basketPrice * current > 0 ? emaWealth / (sample.basketPrice * current) : 0
  if (r > 0 && Math.abs(Math.log(r / rStar)) < Math.log(1 + policy.deadband)) {
    return {
      costScale: current,
      emaWealth,
      acted: false,
      reason: "deadband",
      metrics: publicMetrics,
    }
  }

  const sStar = clampCostScale(
    Math.min(maxS, Math.max(minS, publicMetrics.targetCostScale)),
  )
  const lnS = Math.log(current)
  const lnStar = Math.log(Math.max(sStar, minS))
  const alpha = Math.min(1, Math.max(0, policy.smoothing))
  let lnNext = (1 - alpha) * lnS + alpha * lnStar
  const cap = Math.log(1 + Math.max(0, policy.maxStepPct))
  lnNext = Math.min(lnS + cap, Math.max(lnS - cap, lnNext))
  const next = clampCostScale(Math.min(maxS, Math.max(minS, Math.exp(lnNext))))

  const acted = Math.abs(Math.log(next / current)) > 1e-9
  return {
    costScale: acted ? next : current,
    emaWealth,
    acted,
    reason: acted ? "adjusted" : "deadband",
    metrics: publicMetrics,
  }
}
