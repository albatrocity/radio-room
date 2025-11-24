import { ActivityService } from "../services/ActivityService"
import { HandlerConnections, AppContext } from "@repo/types"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { Emoji } from "@repo/types/Emoji"
import { getRoomPath } from "../lib/getRoomPath"
import { pubUserJoined } from "../operations/sockets/users"

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
    const result = await this.activityService.addReaction(socket.data.roomId, reaction)

    if (!result) {
      return
    }

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "REACTIONS",
      data: { reactions: result.reactions },
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
    const result = await this.activityService.removeReaction(
      socket.data.roomId,
      emoji,
      reactTo,
      user,
    )

    if (!result) {
      return
    }

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "REACTIONS",
      data: { reactions: result.reactions },
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
