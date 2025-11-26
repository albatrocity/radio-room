import { AppContext, Emoji, User, ReactionStore } from "@repo/types"
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
}): Promise<{ reactions: ReactionStore } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.removeReaction(roomId, emoji, reactTo, user)

  if (!result) {
    console.log("[removeReaction] ActivityService returned null - invalid reaction type?")
    return null
  }

  // Ensure reactions exist (getAllRoomReactions could return undefined on error)
  if (!result.reactions) {
    console.warn("[removeReaction] No reactions returned from ActivityService")
    return null
  }

  const reactions = result.reactions

  // Emit event via SystemEvents (broadcasts to Redis PubSub, Socket.IO, and Plugins)
  const reactionPayload = {
    emoji,
    reactTo,
    user,
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "REACTION_REMOVED", {
      roomId,
      reaction: reactionPayload as any,
      reactions,
    })
  }

  return { reactions }
}
