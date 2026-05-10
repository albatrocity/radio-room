import type { ItemDefinition, ShoppingSessionInstance } from "@repo/types"

/**
 * Mirrors {@link ShoppingSessionHelper.sell} refund math for UI preview.
 * Returns null when buyback rates are missing (legacy persisted instances).
 */
export function quoteItemShopsSellCoins(
  instance: ShoppingSessionInstance,
  definition: Pick<ItemDefinition, "shortId" | "coinValue">,
): number | null {
  const listedRate = instance.listedBuybackRate
  const unlistedRate = instance.unlistedBuybackRate
  if (listedRate == null || unlistedRate == null) {
    return null
  }
  const listedIds = instance.listedShortIds ?? []
  const listed = listedIds.includes(definition.shortId)
  const rate = listed ? listedRate : unlistedRate
  const overrides = instance.listedPriceOverrides ?? {}
  const catalogCoin = definition.coinValue ?? 0
  const base = listed ? (overrides[definition.shortId] ?? catalogCoin) : catalogCoin
  return Math.max(0, Math.floor(base * rate))
}
