import type { ChatMessage, ItemDefinition, ItemUseResult } from "@repo/types"
import {
  maskedAttributionMeta,
  resolveItemUseActorDisplayName,
} from "./resolveItemUseActorDisplayName"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

const SKIP_ALERT_META: ChatMessage["meta"] = { type: "alert", status: "info" }

export function skipCurrentTrackUse(opts: { usedMessage: string }): ItemUseHandler {
  return async (
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
      `${displayName.label} put in a ${definition.name} and skipped the current track!`,
      { ...SKIP_ALERT_META, ...maskedAttributionMeta(displayName) },
    )
    return { success: true, consumed: true, message: opts.usedMessage }
  }
}
