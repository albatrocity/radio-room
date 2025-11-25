import { AppContext, Emoji, User } from "@repo/types"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { ActivityService } from "../../services/ActivityService"

/**
 * Operation: Remove a reaction from a reactionable item
 * 
 * This operation handles the business logic of removing a reaction
 * and emits the reactionRemoved event via SystemEvents.
 */
export async function removeReaction({
  context,
  roomId,
  emoji,
  reactTo,
  user,
}: {
  context: AppContext
  roomId: string
  emoji: Emoji
  reactTo: ReactionSubject
  user: User
}): Promise<{ reactions: any[] } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.removeReaction(roomId, emoji, reactTo, user)

  if (!result) {
    return null
  }

  // Emit event via SystemEvents
  const reactionPayload = {
    emoji,
    reactTo,
    user,
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "reactionRemoved", {
      roomId,
      reaction: reactionPayload as any,
    })
  }

  return result
}

