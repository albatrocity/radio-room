import type {
  AddScoreOptions,
  EconomyIntent,
  EconomyScaleState,
  GameAttributeName,
  GameSessionConfig,
} from "@repo/types"

export const COST_SCALE_MIN = 0.25
export const COST_SCALE_MAX = 8
export const EARN_SCALE_MIN = 0.25
export const EARN_SCALE_MAX = 4

export const DEFAULT_SCALED_ATTRIBUTES: GameAttributeName[] = ["coin"]
export const DEFAULT_PRICE_ROUNDING = 1

const IDENTITY: Omit<EconomyScaleState, "updatedAt"> = {
  costScale: 1,
  earnScale: 1,
  scaledAttributes: DEFAULT_SCALED_ATTRIBUTES,
  priceRounding: DEFAULT_PRICE_ROUNDING,
}

export function defaultEconomyScaleState(now = Date.now()): EconomyScaleState {
  return { ...IDENTITY, scaledAttributes: [...DEFAULT_SCALED_ATTRIBUTES], updatedAt: now }
}

export function clampCostScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(COST_SCALE_MAX, Math.max(COST_SCALE_MIN, value))
}

export function clampEarnScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(EARN_SCALE_MAX, Math.max(EARN_SCALE_MIN, value))
}

/**
 * Coerce a missing or partial session economy field to a usable state.
 * Pre-existing persisted sessions have no `economy` — treat that as identity.
 */
export function resolveEconomy(
  economy?: EconomyScaleState | null,
): EconomyScaleState {
  if (!economy) return defaultEconomyScaleState(0)
  return {
    costScale: Number.isFinite(economy.costScale) ? economy.costScale : 1,
    earnScale: Number.isFinite(economy.earnScale) ? economy.earnScale : 1,
    scaledAttributes:
      economy.scaledAttributes?.length > 0
        ? economy.scaledAttributes
        : [...DEFAULT_SCALED_ATTRIBUTES],
    priceRounding:
      Number.isFinite(economy.priceRounding) && economy.priceRounding > 0
        ? economy.priceRounding
        : DEFAULT_PRICE_ROUNDING,
    updatedAt: economy.updatedAt ?? 0,
    updatedBy: economy.updatedBy,
    reason: economy.reason,
  }
}

export function resolveSessionEconomy(
  config?: Pick<GameSessionConfig, "economy"> | null,
): EconomyScaleState {
  return resolveEconomy(config?.economy)
}

export function roundTo(value: number, multiple: number): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(multiple) || multiple <= 0) return Math.round(value)
  return Math.round(value / multiple) * multiple
}

/**
 * Scale an authored base price by `costScale`. Non-positive bases are unchanged
 * so free / unset items stay free. Positive results are floored at 1.
 */
export function scalePrice(base: number, costScale: number, rounding = DEFAULT_PRICE_ROUNDING): number {
  if (!Number.isFinite(base) || base <= 0) return base
  const scale = Number.isFinite(costScale) && costScale > 0 ? costScale : 1
  return Math.max(1, roundTo(base * scale, rounding))
}

/**
 * Scale a positive reward at the ledger. Spends (`amt <= 0`), non-scaled
 * attributes, and `{ intent: "exact" }` pass through unchanged.
 */
export function scaleReward(
  amount: number,
  attribute: GameAttributeName,
  economy: EconomyScaleState,
  intent: EconomyIntent | AddScoreOptions["intent"] = "earn",
): number {
  if (intent === "exact") return amount
  if (!economy.scaledAttributes.includes(attribute)) return amount
  if (!Number.isFinite(amount) || amount <= 0) return amount
  const e = Number.isFinite(economy.earnScale) && economy.earnScale > 0 ? economy.earnScale : 1
  return Math.max(1, Math.round(amount * e))
}
