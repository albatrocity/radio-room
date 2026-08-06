import { AppContext, ReactionPayload } from "@repo/types"
import { ActivityService } from "../../services/ActivityService"

/**
 * Operation: Add a reaction to a reactionable item
 *
 * Emits REACTION_ADDED with the single reaction (delta). Clients patch their
 * local store; INIT still delivers the full snapshot.
 */
export async function addReaction({
  context,
  roomId,
  reaction,
}: {
  context: AppContext
  roomId: string
  reaction: ReactionPayload
}): Promise<{ ok: true } | null> {
  const activityService = new ActivityService(context)
  const result = await activityService.addReaction(roomId, reaction)

  if (!result) {
    console.log("[addReaction] ActivityService returned null - invalid reaction type?")
    return null
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "REACTION_ADDED", {
      roomId,
      reaction,
    })
  }

  return { ok: true }
}
