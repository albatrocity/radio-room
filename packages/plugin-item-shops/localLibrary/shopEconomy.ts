import type { ShopEconomyHooks } from "@repo/plugin-base/helpers"
import {
  isPhysicalMediaDefinition,
  priceForCondition,
  readItemCondition,
  rollOfferCondition,
  type OfferConditionBounds,
} from "./condition"

/** Item Shops economy hooks: condition rolls and sellback for Physical Media only. */
export function physicalMediaShopEconomyHooks(
  getBounds?: () => OfferConditionBounds,
): ShopEconomyHooks {
  return {
    decorateOffer(entry, basePrice) {
      if (!isPhysicalMediaDefinition(entry.definition)) return {}
      const condition = rollOfferCondition(Math.random, getBounds?.())
      return { condition, price: priceForCondition(basePrice, condition) }
    },
    adjustSellBase(item, definition, base) {
      if (!isPhysicalMediaDefinition(definition)) return base
      return priceForCondition(base, readItemCondition(item))
    },
  }
}
