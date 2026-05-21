import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveItemUseActorDisplayName } from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

export const scratchedCd = createItem({
  shortId: "scratched-cd",
  definition: {
    name: "Scratched CD",
    description: "It's in pretty bad shape. You can't even read the name of the artist clearly. Skips whatever song is currently playing.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 75,
    icon: "Disc2",
    rarity: "rare",
  },
  /**
   * @param deps - Plugin API and room context.
   * @param userId - User activating the item.
   * @param _definition - Resolved item definition (unused; behavior is fixed).
   */
  use: async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
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
    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    await context.api.sendSystemMessage(
      context.roomId,
      `${displayName} put in a ${definition.name} and skipped the current track!`,
    )
    return { success: true, consumed: true, message: "Used Scratched CD. It was lost with use." }
  },
})
