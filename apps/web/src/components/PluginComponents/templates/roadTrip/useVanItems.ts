import { useState } from "react"
import type { InventoryItem } from "@repo/types"
import { emitToSocket } from "../../../../actors/socketActor"
import { useUserInventory } from "../../../../hooks/useActors"
import { subscribeInventoryActionResult } from "../../../../lib/inventoryActionResult"
import { useSocketResultHandle } from "../../../../lib/subscribeForSocketResult"

/**
 * The viewer's stacks of road-trip items, and `use` through the normal
 * inventory path (`USE_INVENTORY_ITEM` → the plugin's `onItemUsed`).
 */
export function useVanItems(definitionIds: readonly string[]): {
  held: InventoryItem[]
  pendingItemId: string | null
  use: (item: InventoryItem) => void
} {
  const inventory = useUserInventory()
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const { track } = useSocketResultHandle()
  const held = (inventory?.items ?? []).filter(
    (item) => item.quantity > 0 && definitionIds.includes(item.definitionId),
  )

  const use = (item: InventoryItem) => {
    setPendingItemId(item.itemId)
    track(
      subscribeInventoryActionResult({
        id: `road-trip-use-${item.itemId}-${Date.now()}`,
        onSettled: () => setPendingItemId(null),
        onTimeout: () => setPendingItemId(null),
      }),
    )
    emitToSocket("USE_INVENTORY_ITEM", { itemId: item.itemId })
  }

  return { held, pendingItemId, use }
}
