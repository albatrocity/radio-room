import type { InventoryItem, ItemDefinition } from "@repo/types/Inventory"

const APPRECIATION_PER_MINUTE = 1
const MAX_APPRECIATION = 90

/** Per-stack sellback coins for Mars Egg (time held vs `acquiredAt`). */
export function marsEggSellbackValue(item: InventoryItem, definition: ItemDefinition): number {
  const base = Math.max(0, Math.floor(Number(definition.coinValue ?? 0)))
  const heldMinutes = Math.max(0, Math.floor((Date.now() - item.acquiredAt) / 60_000))
  return base + Math.min(MAX_APPRECIATION, heldMinutes * APPRECIATION_PER_MINUTE)
}
