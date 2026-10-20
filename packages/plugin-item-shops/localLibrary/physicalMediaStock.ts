import type { ItemCatalogEntry, ShopAvailableItem } from "@repo/plugin-base/helpers"
import {
  physicalMediaCarryMatcher,
  type PhysicalMediaCarry,
  type PhysicalMediaPick,
} from "@repo/types"

/** Shop stock for picks: shortIds of resolved picks this room can play (ADR 0216). */
export type PickStock = (picks: readonly PhysicalMediaPick[]) => ShopAvailableItem[]

export const NO_PICK_STOCK: PickStock = () => []

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
