import { AppContext, ReactionPayload } from "@repo/types"
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
}): Promise<{ reactions: any[] } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.addReaction(roomId, reaction)

  if (!result) {
    return null
  }

  // Emit event via SystemEvents
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "reactionAdded", {
      roomId,
      reaction,
    })
  }

  return result
}

