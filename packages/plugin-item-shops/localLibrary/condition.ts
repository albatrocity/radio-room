import type {
  ArtworkFrame,
  InventoryItem,
  ItemDefinition,
  MediaCondition,
  PhysicalMediaFormat,
} from "@repo/types"
import {
  isMediaCondition,
  MEDIA_CONDITIONS,
  PHYSICAL_MEDIA_CONDITION_KEY,
} from "@repo/types"

export {
  MEDIA_CONDITIONS,
  MEDIA_CONDITION_LABELS,
  PHYSICAL_MEDIA_CONDITION_KEY,
  type MediaCondition,
} from "@repo/types"

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
 * Mint frame per format today; all three conditions are identical so a later
 * per-condition artwork pass is a table edit (ADR 0155).
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

/** `mint → good → poor → null`. `null` means the copy converts. */
export function degradeCondition(condition: MediaCondition): MediaCondition | null {
  if (condition === "mint") return "good"
  if (condition === "good") return "poor"
  return null
}

export function rollOfferCondition(random: () => number = Math.random): MediaCondition {
  const total = MEDIA_CONDITIONS.reduce((sum, c) => sum + CONDITION_OFFER_WEIGHTS[c], 0)
  let r = random() * total
  for (const condition of MEDIA_CONDITIONS) {
    r -= CONDITION_OFFER_WEIGHTS[condition]
    if (r <= 0) return condition
  }
  return "poor"
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
