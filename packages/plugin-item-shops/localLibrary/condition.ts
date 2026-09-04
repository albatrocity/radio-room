import type { MediaCondition } from "@repo/types"
import { isMediaCondition, MEDIA_CONDITION_LABELS, MEDIA_CONDITIONS } from "@repo/types"

export {
  ARTWORK_FRAME_BY_FORMAT,
  artworkFrameForFormat,
  formatFromArtworkFrame,
  isPhysicalMediaDefinition,
  MEDIA_CONDITION_PALETTE,
  MEDIA_CONDITIONS,
  MEDIA_CONDITION_LABELS,
  PHYSICAL_MEDIA_CONDITION_KEY,
  readItemCondition,
  isMediaConditionDegraded,
  isMediaConditionImproved,
  type MediaCondition,
} from "@repo/types"

/** Worst/best Record Store offer condition (ADR 0158). Defaults span the full ladder. */
export type OfferConditionBounds = {
  min: MediaCondition
  max: MediaCondition
}

export const DEFAULT_OFFER_CONDITION_BOUNDS: OfferConditionBounds = {
  min: "poor",
  max: "mint",
}

export const OFFER_CONDITION_SELECT_OPTIONS: { value: MediaCondition; label: string }[] =
  MEDIA_CONDITIONS.map((value) => ({ value, label: MEDIA_CONDITION_LABELS[value] }))

/** Independent of item rarity so P(legendary ∧ mint) = P(legendary) × P(mint). */
export const CONDITION_OFFER_WEIGHTS: Record<MediaCondition, number> = {
  mint: 1,
  good: 2,
  poor: 4,
}

export const CONDITION_PRICE_MULTIPLIER: Record<MediaCondition, number> = {
  mint: 1,
  good: 0.7,
  poor: 0.45,
}

/** Higher = worse. Used to spend the beater copy first. */
export const CONDITION_WEAR_RANK: Record<MediaCondition, number> = {
  mint: 0,
  good: 1,
  poor: 2,
}

/**
 * The wear ladder as one declarative table (ADR 0155 / 0159), so degradation and
 * restoration can never disagree about the ordering.
 */
const CONDITION_LADDER: Record<
  MediaCondition,
  { worse: MediaCondition | null; better: MediaCondition | null }
> = {
  mint: { worse: "good", better: null },
  good: { worse: "poor", better: "mint" },
  poor: { worse: null, better: "good" },
}

/** `mint → good → poor → null`. `null` means the copy converts. */
export function degradeCondition(condition: MediaCondition): MediaCondition | null {
  return CONDITION_LADDER[condition].worse
}

/** `poor → good → mint → null`. `null` means the copy is already Mint. */
export function restoreCondition(condition: MediaCondition): MediaCondition | null {
  return CONDITION_LADDER[condition].better
}

/** Closed wear-rank interval between `min` and `max` (order-insensitive). */
export function conditionsWithinBounds(
  min: MediaCondition = DEFAULT_OFFER_CONDITION_BOUNDS.min,
  max: MediaCondition = DEFAULT_OFFER_CONDITION_BOUNDS.max,
): MediaCondition[] {
  const lo = Math.min(CONDITION_WEAR_RANK[min], CONDITION_WEAR_RANK[max])
  const hi = Math.max(CONDITION_WEAR_RANK[min], CONDITION_WEAR_RANK[max])
  return MEDIA_CONDITIONS.filter((c) => {
    const rank = CONDITION_WEAR_RANK[c]
    return rank >= lo && rank <= hi
  })
}

export function readOfferConditionBounds(input: {
  offerConditionMin?: unknown
  offerConditionMax?: unknown
}): OfferConditionBounds {
  return {
    min: isMediaCondition(input.offerConditionMin)
      ? input.offerConditionMin
      : DEFAULT_OFFER_CONDITION_BOUNDS.min,
    max: isMediaCondition(input.offerConditionMax)
      ? input.offerConditionMax
      : DEFAULT_OFFER_CONDITION_BOUNDS.max,
  }
}

export function rollOfferCondition(
  random: () => number = Math.random,
  bounds?: OfferConditionBounds,
): MediaCondition {
  const allowed = conditionsWithinBounds(
    bounds?.min ?? DEFAULT_OFFER_CONDITION_BOUNDS.min,
    bounds?.max ?? DEFAULT_OFFER_CONDITION_BOUNDS.max,
  )
  const total = allowed.reduce((sum, c) => sum + CONDITION_OFFER_WEIGHTS[c], 0)
  let r = random() * total
  for (const condition of allowed) {
    r -= CONDITION_OFFER_WEIGHTS[condition]
    if (r <= 0) return condition
  }
  return allowed[allowed.length - 1] ?? "poor"
}

export function priceForCondition(base: number, condition: MediaCondition): number {
  return Math.max(1, Math.round(base * CONDITION_PRICE_MULTIPLIER[condition]))
}
