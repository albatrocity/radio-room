import { INVENTORY_PEEK_FLAG } from "@repo/plugin-base"
import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

const FIVE_MIN_MS = 5 * 60 * 1000

async function useXRay(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { game } = deps
  const applied = await game.applyTimedModifier(
    userId,
    FIVE_MIN_MS,
    {
      name: "x-ray",
      effects: [
        {
          type: "flag",
          name: INVENTORY_PEEK_FLAG,
          value: true,
          intent: "neutral",
          icon: definition.icon as never,
        },
      ],
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
      visibility: "self",
    },
    userId,
  )

  if (!applied.ok) {
    if (applied.reason === "defense_blocked") {
      return {
        success: false,
        consumed: true,
        title: "Intercepted",
        message:
          applied.attackerMessage ??
          `Blocked by ${applied.blockingItemName}. Your item was lost with use.`,
      }
    }
    return { success: false, consumed: false, message: "Could not apply effect." }
  }

  return {
    success: true,
    consumed: true,
    message: "X-Ray active. You can see other listeners' inventories for 5 minutes.",
  }
}

export const xRay = createItem({
  shortId: "x-ray",
  definition: {
    name: "X-Ray",
    description: "For 5 minutes, peer into anybody's inventory — and see through disguises.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 50,
    icon: "ScanSearch",
    rarity: "rare",
  },
  use: useXRay,
})
