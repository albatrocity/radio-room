import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const hummusVeggies = createItem({
  shortId: "hummus-veggies",
  definition: {
    name: "Hummus & Veggies",
    description: "Move any song up 1 position in the queue.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "queueItem",
    coinValue: 50,
    icon: "salad",
    rarity: "rare",
  },
  /**
   * @param deps - Plugin API and room context.
   * @param userId - User activating the item.
   * @param _definition - Resolved item definition (unused).
   * @param callContext - Must include `targetQueueItemId` when promoting.
   */
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    _definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> => {
    const { context } = deps
    const targetQueueItemId = (callContext as { targetQueueItemId?: string } | undefined)
      ?.targetQueueItemId

    if (!targetQueueItemId) {
      return { success: false, consumed: false, message: "Select a track to promote." }
    }

    const result = await context.api.moveTrackByPosition(
      context.roomId,
      targetQueueItemId,
      -1,
      userId,
    )

    if (!result.success) {
      return { success: false, consumed: false, message: result.message }
    }

    const [user] = await context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId
    await context.api.sendSystemMessage(
      context.roomId,
      `${username} used Hummus & Veggies to promote a track!`,
    )

    return {
      success: true,
      consumed: true,
      message: "Track promoted!",
    }
  },
})
