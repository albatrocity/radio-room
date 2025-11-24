import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { Emoji } from "@repo/types/Emoji"
import { REACTIONABLE_TYPES } from "../lib/constants"
import {
  addReaction as addReactionData,
  getAllRoomReactions,
  removeReaction as removeReactionData,
  updateUserAttributes,
} from "../operations/data"

/**
 * A service that handles user activity operations without Socket.io dependencies
 */
export class ActivityService {
  constructor(private context: AppContext) {}

  /**
   * Update user status to listening
   */
  async startListening(roomId: string, userId: string) {
    const result = await updateUserAttributes({
      context: this.context,
      userId,
      attributes: {
        status: "listening",
      },
      roomId,
    })

    return result
  }

  /**
   * Update user status to participating
   */
  async stopListening(roomId: string, userId: string) {
    const result = await updateUserAttributes({
      context: this.context,
      userId,
      attributes: {
        status: "participating",
      },
      roomId,
    })

    return result
  }

  /**
   * Add a reaction to a reactionable item
   */
  async addReaction(roomId: string, reaction: ReactionPayload) {
    const { reactTo } = reaction

    if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
      return null
    }

    await addReactionData({ context: this.context, roomId, reaction, reactTo })
    const reactions = await getAllRoomReactions({ context: this.context, roomId })

    return { reactions }
  }

  /**
   * Remove a reaction from a reactionable item
   */
  async removeReaction(roomId: string, emoji: Emoji, reactTo: ReactionSubject, user: User) {
    if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
      return null
    }

    await removeReactionData({
      context: this.context,
      roomId,
      reaction: { emoji, reactTo, user },
      reactTo,
    })

    const reactions = await getAllRoomReactions({ context: this.context, roomId })

    return { reactions }
  }
}
