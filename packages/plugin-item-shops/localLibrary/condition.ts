import type {
  ArtworkFrame,
  InventoryItem,
  ItemDefinition,
  MediaCondition,
  PhysicalMediaFormat,
} from "@repo/types"
import {
  isMediaCondition,
  MEDIA_CONDITION_LABELS,
  MEDIA_CONDITIONS,
  PHYSICAL_MEDIA_CONDITION_KEY,
} from "@repo/types"

export {
  MEDIA_CONDITIONS,
  MEDIA_CONDITION_LABELS,
  PHYSICAL_MEDIA_CONDITION_KEY,
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
 * One frame per format, repeated across conditions: the frame says which object
 * this is, and the client draws wear by passing the condition alongside it
 * (ADR 0157). The condition axis stays in the signature so the server keeps
 * deciding what a copy looks like.
 */
export const ARTWORK_FRAME_BY_FORMAT_AND_CONDITION: Record<
  PhysicalMediaFormat,
  Record<MediaCondition, ArtworkFrame>
> = {
  CD: { mint: "jewel-case", good: "jewel-case", poor: "jewel-case" },
  LP: { mint: "record-jacket", good: "record-jacket", poor: "record-jacket" },
  TAPE: { mint: "cassette-case", good: "cassette-case", poor: "cassette-case" },
  "45": { mint: "die-cut-jacket", good: "die-cut-jacket", poor: "die-cut-jacket" },
}

export function readItemCondition(item: InventoryItem): MediaCondition {
  const raw = item.metadata?.[PHYSICAL_MEDIA_CONDITION_KEY]
  return isMediaCondition(raw) ? raw : "mint"
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

export function artworkFrameForFormat(
  format: PhysicalMediaFormat,
  condition: MediaCondition,
): ArtworkFrame {
  return ARTWORK_FRAME_BY_FORMAT_AND_CONDITION[format][condition]
}

/** True when this definition is derived Physical Media (not a library card). */
export function isPhysicalMediaDefinition(
  definition: Pick<ItemDefinition, "mediaFormat" | "artworkFrame">,
): boolean {
  return definition.mediaFormat != null || definition.artworkFrame != null
}
