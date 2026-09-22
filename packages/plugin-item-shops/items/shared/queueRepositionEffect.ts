import type { ItemDefinition, ItemUseResult } from "@repo/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "./resolveItemUseActorDisplayName"
import { toDefenseBlockedUseResult } from "./toDefenseBlockedUseResult"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

export type QueueRepositionAnnounceParams = {
  actor: string
  trackTitle: string
  victimUsername?: string
  isOwnTrack: boolean
}

export type QueueRepositionMessages = {
  /** When `targetQueueItemId` is missing. */
  selectTarget: string
  /** Toast on successful move. */
  success: string
  /** System chat line after a successful move. */
  announce: (p: QueueRepositionAnnounceParams) => string
}

export type QueueRepositionEffectConfig = {
  /** Passed to `moveTrackByPosition` (negative = promote). */
  delta: number
  messages: QueueRepositionMessages
}

/**
 * Shared use handler for queue promote/demote consumables (beers, seltzer).
 */
export function queueRepositionEffect(config: QueueRepositionEffectConfig): ItemUseHandler {
  return async (
    deps: ItemShopsBehaviorDeps,
    userId: string,
    _definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> => {
    const { context } = deps
    const targetQueueItemId = (callContext as { targetQueueItemId?: string } | undefined)
      ?.targetQueueItemId

    if (!targetQueueItemId) {
      return { success: false, consumed: false, message: config.messages.selectTarget }
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
      config.delta,
      userId,
    )

    if (!result.success) {
      if (result.reason === "defense_blocked") {
        return toDefenseBlockedUseResult(result)
      }
      return { success: false, consumed: false, message: result.message }
    }

    const [attackedUser] = targetedItem.addedBy
      ? await deps.context.api.getUsersByIds([targetedItem.addedBy.userId])
      : [undefined]

    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    const message = config.messages.announce({
      actor: displayName.label,
      trackTitle: targetedItem.track.title,
      victimUsername: attackedUser?.username,
      isOwnTrack: attackedUser?.userId === userId,
    })
    await sendAttributedSystemMessage(deps, message, displayName)

    return {
      success: true,
      consumed: true,
      message: config.messages.success,
    }
  }
}
