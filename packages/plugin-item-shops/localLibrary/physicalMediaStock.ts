import type { ItemCatalogEntry, ShopAvailableItem } from "@repo/plugin-base/helpers"
import { matchesPhysicalMediaCarry, type PhysicalMediaCarry } from "@repo/types"

/** Derived records in `carry`, as shop stock (ADR 0214). */
export function matchingPhysicalMedia(
  entries: readonly ItemCatalogEntry[],
  carry: PhysicalMediaCarry,
): ShopAvailableItem[] {
  return entries
    .filter((entry) => matchesPhysicalMediaCarry(entry.definition, carry))
    .map((entry) => ({
      shortId: entry.definition.shortId,
      coinValue: entry.definition.coinValue ?? 0,
    }))
}
