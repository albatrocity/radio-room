import type { TextEffectKind } from "@repo/plugin-base"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import { analogDelayPedal } from "./analog-delay-pedal"
import { fuzzPedal } from "./fuzz-pedal"
import { boostPedal } from "./boost-pedal"
import { bufferPedal } from "./buffer-pedal"
import { buyout } from "./buyout"
import { carrots } from "./carrots"
import { tomatoes } from "./tomatoes"
import { cateredMeal } from "./catered-meal"
import { compressorPedal } from "./compressor-pedal"
import { lemons } from "./lemons"
import { emptyFridge } from "./empty-fridge"
import { gate } from "./gate"
import { warmBeer } from "./hummus-veggies"
import { lychees } from "./lychees"
import { jokerPedal } from "./joker-pedal"
import { marsEgg } from "./mars-egg"
import { cucumberSlices } from "./cucumber-slices"
import { sampleHold } from "./sample-hold"
import { p2pFileSharing } from "./p2p-file-sharing"
import { blueberries } from "./blueberries"
import { rubberBand } from "./rubber-band"
import { disguise } from "./disguise"
import { scratchedCd } from "./scratched-cd"
import { tubeOverdrive } from "./tube-overdrive"
import { warranty } from "./warranty"
import { vanCubby } from "./van-cubby"
import { merchCashBox } from "./merch-cash-box"
import { snoozePedal } from "./snooze-pedal"
import { coffeePedal } from "./coffee-pedal"
import { gravityBong } from "./gravity-bong"
import { nineVoltBattery } from "./9v-battery"
import { privateBathroom } from "./private-bathroom"
import { echoTextEffect, sizeShiftTextEffect } from "./textEffects/sizeShift"
import type {
  ItemUseHandler,
  DefenseTriggeredHandler,
  ItemSellbackValueHandler,
} from "./shared/types"
import { greenPeas } from "./green-peas"

/**
 * All registered items. Import from here in shops: `import { items } from "../items"` or
 * `../../items` depending on depth — then use `items.boostPedal.shortId`.
 */
export const items = {
  scratchedCd,
  analogDelayPedal,
  fuzzPedal,
  tubeOverdrive,
  compressorPedal,
  boostPedal,
  bufferPedal,
  gate,
  sampleHold,
  jokerPedal,
  warmBeer,
  emptyFridge,
  cateredMeal,
  warranty,
  buyout,
  vanCubby,
  merchCashBox,
  snoozePedal,
  coffeePedal,
  gravityBong,
  marsEgg,
  disguise,
  p2pFileSharing,
  nineVoltBattery,
  rubberBand,
  carrots,
  tomatoes,
  greenPeas,
  lychees,
  cucumberSlices,
  blueberries,
  lemons,
  privateBathroom,
  coldBeer,
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

function buildItemDefenseTriggeredBehaviors(): Record<string, DefenseTriggeredHandler> {
  const out: Record<string, DefenseTriggeredHandler> = {}
  for (const i of Object.values(items)) {
    if (i.onDefenseTriggered) {
      out[i.shortId] = i.onDefenseTriggered
    }
  }
  return out
}

/** Registry of `shortId` → `onDefenseTriggered` handler (post-consume side effects / messaging). */
export const ITEM_DEFENSE_TRIGGERED_BEHAVIORS: Record<string, DefenseTriggeredHandler> =
  buildItemDefenseTriggeredBehaviors()

function buildItemSellbackValueBehaviors(): Record<string, ItemSellbackValueHandler> {
  const out: Record<string, ItemSellbackValueHandler> = {}
  for (const i of Object.values(items)) {
    if (i.sellbackValue) {
      out[i.shortId] = i.sellbackValue
    }
  }
  return out
}

/** Registry of `shortId` → sellback override (per-stack coin amount when selling). */
export const ITEM_SELLBACK_VALUE_BEHAVIORS: Record<string, ItemSellbackValueHandler> =
  buildItemSellbackValueBehaviors()

export function getItemCatalogEntry(shortId: string): ItemCatalogEntry | undefined {
  return ITEM_CATALOG.find((e) => e.definition.shortId === shortId)
}

/**
 * Ordered pipeline for `applyTextEffects`. Item-owned kinds (`coffee`, `snooze`,
 * `gate`, `scramble`, `joker`, …) are collected automatically from `items[*].textEffect`.
 * Cross-cutting kinds that read flags from multiple items (`sizeShift` reads
 * grow+shrink, `echo` reads echo + inherits non-size effects from base segments) live in
 * `items/textEffects/sizeShift.ts` and are appended explicitly.
 */
export const TEXT_EFFECT_KINDS: readonly TextEffectKind[] = (() => {
  const ownedKinds = Object.values(items)
    .map((i) => i.textEffect)
    .filter((k): k is TextEffectKind => k != null)
  return [...ownedKinds, sizeShiftTextEffect, echoTextEffect]
})()
