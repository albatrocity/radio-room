import { AppContext, Emoji, User } from "@repo/types"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { ActivityService } from "../../services/ActivityService"

/**
 * Operation: Remove a reaction from a reactionable item
 *
 * Emits REACTION_REMOVED with the single reaction (delta). Clients patch their
 * local store; INIT still delivers the full snapshot.
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
}): Promise<{ ok: true } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.removeReaction(roomId, emoji, reactTo, user)

  if (!result) {
    console.log("[removeReaction] ActivityService returned null - invalid reaction type?")
    return null
  }

  const reactionPayload = {
    emoji,
    reactTo,
    user,
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "REACTION_REMOVED", {
      roomId,
      reaction: reactionPayload as any,
    })
  }

  return { ok: true }
}
