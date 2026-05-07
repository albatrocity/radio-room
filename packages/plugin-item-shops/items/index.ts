import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import { analogDelayPedal } from "./analog-delay-pedal"
import { boostPedal } from "./boost-pedal"
import { buyout } from "./buyout"
import { cateredMeal } from "./catered-meal"
import { compressorPedal } from "./compressor-pedal"
import { emptyFridge } from "./empty-fridge"
import { gate } from "./gate"
import { hummusVeggies } from "./hummus-veggies"
import { jokerPedal } from "./joker-pedal"
import { sampleHold } from "./sample-hold"
import { scratchedCd } from "./scratched-cd"
import { warranty } from "./warranty"
import type { ItemUseHandler } from "./shared/types"

/**
 * All registered items. Import from here in shops: `import { items } from "../items"` or
 * `../../items` depending on depth — then use `items.boostPedal.shortId`.
 */
export const items = {
  scratchedCd,
  analogDelayPedal,
  compressorPedal,
  boostPedal,
  gate,
  sampleHold,
  jokerPedal,
  hummusVeggies,
  emptyFridge,
  cateredMeal,
  warranty,
  buyout,
} as const

/**
 * Master item catalog (prices, rarity, inventory flags). Shop-specific price
 * overrides live under `shops/`.
 */
export const ITEM_CATALOG: readonly ItemCatalogEntry[] = Object.values(items).map(
  (i) => i.catalogEntry,
)

function buildItemUseBehaviors(): Record<string, ItemUseHandler> {
  const out: Record<string, ItemUseHandler> = {}
  for (const i of Object.values(items)) {
    if (i.use) {
      out[i.shortId] = i.use
    }
  }
  return out
}

/** Registry of `shortId` → use handler. Items without a handler get "Unknown item" on use. */
export const ITEM_USE_BEHAVIORS: Record<string, ItemUseHandler> = buildItemUseBehaviors()

export function getItemCatalogEntry(shortId: string): ItemCatalogEntry | undefined {
  return ITEM_CATALOG.find((e) => e.definition.shortId === shortId)
}
