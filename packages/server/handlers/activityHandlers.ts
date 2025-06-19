import { HandlerConnections } from "@repo/types/HandlerConnections"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { ReactionPayload } from "@repo/types/Reaction"
import { Emoji } from "@repo/types/Emoji"
import { createActivityHandlers } from "./activityHandlersAdapter"

/**
 * Update user status to listening
 */
export async function startListening({ socket, io }: HandlerConnections) {
  const { context } = socket
  const activityHandlers = createActivityHandlers(context)
  return activityHandlers.startListening({ socket, io })
}

/**
 * Update user status to participating
 */
export async function stopListening({ socket, io }: HandlerConnections) {
  const { context } = socket
  const activityHandlers = createActivityHandlers(context)
  return activityHandlers.stopListening({ socket, io })
}

/**
 * Add a reaction to a reactionable item
 */
export async function addReaction({ io, socket }: HandlerConnections, reaction: ReactionPayload) {
  const { context } = socket
  const activityHandlers = createActivityHandlers(context)
  return activityHandlers.addReaction({ socket, io }, reaction)
}

/**
 * Remove a reaction from a reactionable item
 */
export async function removeReaction(
  { io, socket }: HandlerConnections,
  {
    emoji,
    reactTo,
    user,
  }: {
    emoji: Emoji
    reactTo: ReactionSubject
    user: User
  },
) {
  const { context } = socket
  const activityHandlers = createActivityHandlers(context)
  return activityHandlers.removeReaction({ socket, io }, { emoji, reactTo, user })
}
