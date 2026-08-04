import { ActivityService } from "../services/ActivityService"
import { HandlerConnections, AppContext } from "@repo/types"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { Emoji } from "@repo/types/Emoji"
import { addReaction as addReactionOp, removeReaction as removeReactionOp } from "../operations/reactions"

async function emitUserStatusChanged(
  context: AppContext | undefined,
  roomId: string,
  user: User,
  oldStatus?: string,
) {
  if (!context?.systemEvents) return
  await context.systemEvents.emit(roomId, "USER_STATUS_CHANGED", {
    roomId,
    user,
    oldStatus,
  })
}

/**
 * Socket.io adapter for the ActivityService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class ActivityHandlers {
  constructor(private activityService: ActivityService) {}

  /**
   * Update user status to listening
   */
  startListening = async (
    { socket }: HandlerConnections,
    payload?: { audioTransport?: "shoutcast" | "webrtc" },
  ) => {
    const result = await this.activityService.startListening(
      socket.data.roomId,
      socket.data.userId,
      payload?.audioTransport,
    )

    if (!result.user) {
      return
    }

    await emitUserStatusChanged(socket.context, socket.data.roomId, result.user, "participating")
  }

  setListeningAudioTransport = async (
    { socket }: HandlerConnections,
    payload: { audioTransport: "shoutcast" | "webrtc" },
  ) => {
    const result = await this.activityService.setListeningAudioTransport(
      socket.data.roomId,
      socket.data.userId,
      payload.audioTransport,
    )

    if (!result.user) {
      return
    }

    await emitUserStatusChanged(socket.context, socket.data.roomId, result.user, "listening")
  }

  /**
   * Update user status to participating
   */
  stopListening = async ({ socket }: HandlerConnections) => {
    const result = await this.activityService.stopListening(socket.data.roomId, socket.data.userId)

    if (!result.user) {
      return
    }

    await emitUserStatusChanged(socket.context, socket.data.roomId, result.user, "listening")
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
