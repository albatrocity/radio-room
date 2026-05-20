import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import { type ItemShopsBehaviorDeps, createItem } from "../shared/types"

export const gravityBong = createItem({
  shortId: "gravity-bong",
  definition: {
    name: "Gravity Bong",
    description: "*cough cough* Hey dude, you want a hit of this thing? Shuffles entire queue.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "Shuffle",
    rarity: "legendary",
  },
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
    _callContext?: unknown,
  ): Promise<ItemUseResult> => {
    const result = await deps.context.api.shuffleTrackQueue(deps.context.roomId)
    if (!result.success) {
      return {
        success: false,
        consumed: true,
        message: `Failed to shuffle queue: ${result.message}`,
      }
    }

    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    await deps.context.api.sendSystemMessage(
      deps.context.roomId,
      `*cough cough* Woah... ${displayName} took a huge rip of the ${definition.name} and shuffled the queue!`,
    )

    return { success: true, consumed: true, message: "Queue shuffled!" }
  },
})
