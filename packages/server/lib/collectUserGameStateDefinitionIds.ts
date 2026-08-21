import type { UserGameState } from "@repo/types"
import type { UserInventory } from "@repo/types"

/**
 * Definition ids needed to render a user's inventory and modifiers on
 * `USER_GAME_STATE`. Shop-offer extras come from plugins via
 * `referencedItemDefinitionIdsForUser` (see ADR 0097).
 */
export function collectInventoryAndModifierDefinitionIds(
  inventory: UserInventory | null | undefined,
  state: UserGameState | null | undefined,
): string[] {
  const ids = new Set<string>()
  for (const item of inventory?.items ?? []) {
    const id = item.definitionId?.trim()
    if (id) ids.add(id)
  }
  for (const modifier of state?.modifiers ?? []) {
    const id = modifier.itemDefinitionId?.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}
