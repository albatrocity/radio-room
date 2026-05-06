import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const scratchedCd = createItem({
  shortId: "scratched-cd",
  definition: {
    name: "Scratched CD",
    description: "Skip the currently playing song instantly.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "disc-2",
    rarity: "rare",
  },
  /**
   * @param deps - Plugin API, room context, and configured pedal duration.
   * @param userId - User activating the item.
   * @param _definition - Resolved item definition (unused; behavior is fixed).
   */
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    _definition: ItemDefinition,
  ): Promise<ItemUseResult> => {
    const { context, pluginName } = deps
    const np = await context.api.getNowPlaying(context.roomId)
    if (!np?.mediaSource?.trackId) {
      return { success: false, consumed: false, message: "Nothing is playing right now." }
    }
    try {
      await context.api.skipTrack(context.roomId, np.mediaSource.trackId)
    } catch (err) {
      console.error(`[${pluginName}] skipTrack failed`, err)
      return { success: false, consumed: false, message: "Could not skip the track." }
    }
    const [user] = await context.api.getUsersByIds([userId])
    const username = user?.username?.trim() || userId
    await context.api.sendSystemMessage(
      context.roomId,
      `${username} used a Scratched CD and skipped the current track!`,
    )
    return { success: true, consumed: true, message: "Used Scratched CD. It was lost with use." }
  },
})
