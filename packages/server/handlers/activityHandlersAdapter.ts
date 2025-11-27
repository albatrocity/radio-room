import { ActivityService } from "../services/ActivityService"
import { HandlerConnections, AppContext } from "@repo/types"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { Emoji } from "@repo/types/Emoji"
import { pubUserJoined } from "../operations/sockets/users"
import { addReaction as addReactionOp, removeReaction as removeReactionOp } from "../operations/reactions"

/**
 * Socket.io adapter for the ActivityService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class ActivityHandlers {
  constructor(private activityService: ActivityService) {}

  /**
   * Update user status to listening
   */
  startListening = async ({ socket, io }: HandlerConnections) => {
    const result = await this.activityService.startListening(socket.data.roomId, socket.data.userId)

    if (!result.user) {
      return
    }

    pubUserJoined({
      io,
      roomId: socket.data.roomId,
      data: { user: result.user, users: result.users },
      context: socket.context,
    })
  }

  /**
   * Update user status to participating
   */
  stopListening = async ({ socket, io }: HandlerConnections) => {
    const result = await this.activityService.stopListening(socket.data.roomId, socket.data.userId)

    if (!result.user) {
      return
    }

    pubUserJoined({
      io,
      roomId: socket.data.roomId,
      data: { user: result.user, users: result.users },
      context: socket.context,
    })
  }

  /**
   * Add a reaction to a reactionable item
   */
  addReaction = async ({ io, socket }: HandlerConnections, reaction: ReactionPayload) => {
    // Call operation (which broadcasts via SystemEvents to Redis PubSub, Socket.IO, and Plugins)
    await addReactionOp({
      context: socket.context,
      roomId: socket.data.roomId,
      reaction,
    })
  }

  /**
   * Remove a reaction from a reactionable item
   */
  removeReaction = async (
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
  ) => {
    // Call operation (which broadcasts via SystemEvents to Redis PubSub, Socket.IO, and Plugins)
    await removeReactionOp({
      context: socket.context,
      roomId: socket.data.roomId,
      emoji,
      reactTo,
      user,
    })
  }
}

/**
 * Factory function to create Activity handlers
 */
export function createActivityHandlers(context: AppContext) {
  const activityService = new ActivityService(context)
  return new ActivityHandlers(activityService)
}
