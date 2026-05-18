import type { ItemDefinition, ItemUseResult, QueueItem, User } from "@repo/types"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const hummusVeggies = createItem({
  shortId: "hummus-veggies",
  definition: {
    name: "Hummus & Veggies",
    description: "Hey, not bad. Move any song up 1 position in the queue.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "queueItem",
    coinValue: 20,
    icon: "Salad",
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

    const targetedItem = await context.api
      .getQueue(context.roomId)
      .then((queue) => queue.find((item) => item.track.id === targetQueueItemId))

    if (!targetedItem) {
      return { success: false, consumed: false, message: "Targeted track not found in queue." }
    }

    const result = await context.api.moveTrackByPosition(
      context.roomId,
      targetQueueItemId,
      -1,
      userId,
    )

    if (!result.success) {
      if (result.reason === "defense_blocked") {
        return {
          success: false,
          consumed: true,
          message:
            result.attackerMessage ??
            `Blocked by ${result.blockingItemName}. Your item was lost with use.`,
        }
      }
      return { success: false, consumed: false, message: result.message }
    }

    const [attackedUser] = targetedItem.addedBy
      ? await deps.context.api.getUsersByIds([targetedItem.addedBy?.userId])
      : [undefined]

    const displayName = await resolveItemUseActorDisplayName(deps, userId)

    const message = makeMessage(displayName, attackedUser, targetedItem, userId)

    await context.api.sendSystemMessage(context.roomId, message)

    return {
      success: true,
      consumed: true,
      message: "Track promoted!",
    }
  },
})

function makeMessage(
  displayName: string,
  attackedUser: User | undefined,
  targetedItem: QueueItem,
  userId: string,
): string {
  if (attackedUser) {
    if (attackedUser.userId === userId) {
      return `Yum! ${displayName} ate Hummus & Veggies and promoted their own track, "${targetedItem.track.title}"!`
    }

    return `Yum! ${displayName} ate Hummus & Veggies and promoted ${attackedUser.username}'s track, "${targetedItem.track.title}"!`
  }

  return `Yum! ${displayName} ate Hummus & Veggies and promoted a track, "${targetedItem.track.title}"!`
}
