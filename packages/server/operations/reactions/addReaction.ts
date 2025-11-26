import { AppContext, ReactionPayload, ReactionStore } from "@repo/types"
import { ActivityService } from "../../services/ActivityService"

/**
 * Operation: Add a reaction to a reactionable item
 *
 * This operation handles the business logic of adding a reaction
 * and emits the reactionAdded event via SystemEvents.
 */
export async function addReaction({
  context,
  roomId,
  reaction,
}: {
  context: AppContext
  roomId: string
  reaction: ReactionPayload
}): Promise<{ reactions: ReactionStore } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.addReaction(roomId, reaction)

  if (!result) {
    console.log("[addReaction] ActivityService returned null - invalid reaction type?")
    return null
  }

  // Ensure reactions exist (getAllRoomReactions could return undefined on error)
  if (!result.reactions) {
    console.warn("[addReaction] No reactions returned from ActivityService")
    return null
  }

  const reactions = result.reactions

  // Emit event via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "reactionAdded", {
      roomId,
      reaction,
      reactions,
    })
  }

  return { reactions }
}
