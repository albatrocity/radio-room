import type { ItemCatalogEntry, ShopAvailableItem } from "@repo/plugin-base/helpers"
import { physicalMediaCarryMatcher, type PhysicalMediaCarry } from "@repo/types"

/** Derived records in `carry`, as shop stock (ADR 0214). */
export function matchingPhysicalMedia(
  entries: readonly ItemCatalogEntry[],
  carry: PhysicalMediaCarry,
): ShopAvailableItem[] {
  const matches = physicalMediaCarryMatcher(carry)
  return entries
    .filter((entry) => matches(entry.definition))
    .map((entry) => ({
      shortId: entry.definition.shortId,
      coinValue: entry.definition.coinValue ?? 0,
    }))
}

/** How many derived records `carry` matches, without building stock rows. */
export function countMatchingPhysicalMedia(
  entries: readonly ItemCatalogEntry[],
  carry: PhysicalMediaCarry,
): number {
  const matches = physicalMediaCarryMatcher(carry)
  let count = 0
  for (const entry of entries) if (matches(entry.definition)) count++
  return count
}
