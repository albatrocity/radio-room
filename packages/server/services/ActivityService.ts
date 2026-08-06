import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { Emoji } from "@repo/types/Emoji"
import { REACTIONABLE_TYPES } from "../lib/constants"
import {
  addReaction as addReactionData,
  removeReaction as removeReactionData,
  updateUserAttributes,
} from "../operations/data"
import {
  type ListeningAudioTransport,
  onListeningStarted,
  onListeningStopped,
  onListeningTransportChanged,
} from "../operations/room/listeningTransportStats"

/**
 * A service that handles user activity operations without Socket.io dependencies
 */
export class ActivityService {
  constructor(private context: AppContext) {}

  /**
   * Update user status to listening
   */
  async startListening(
    roomId: string,
    userId: string,
    audioTransport?: ListeningAudioTransport,
  ) {
    await onListeningStarted(this.context, roomId, userId, audioTransport)

    return updateUserAttributes({
      context: this.context,
      userId,
      attributes: {
        status: "listening",
      },
      roomId,
      includeRoomUsers: false,
    })
  }

  /**
   * Update user status to participating
   */
  async stopListening(roomId: string, userId: string) {
    await onListeningStopped(this.context, roomId, userId)

    return updateUserAttributes({
      context: this.context,
      userId,
      attributes: {
        status: "participating",
      },
      roomId,
      includeRoomUsers: false,
    })
  }

  /**
   * Switch listen transport while remaining in listening mode.
   */
  async setListeningAudioTransport(
    roomId: string,
    userId: string,
    audioTransport: ListeningAudioTransport,
  ) {
    await onListeningTransportChanged(this.context, roomId, userId, audioTransport)

    return updateUserAttributes({
      context: this.context,
      userId,
      attributes: { status: "listening" },
      roomId,
      includeRoomUsers: false,
    })
  }

  /**
   * Add a reaction to a reactionable item.
   * Does not reload the full room reaction store — callers emit a delta.
   */
  async addReaction(roomId: string, reaction: ReactionPayload) {
    const { reactTo } = reaction

    if (REACTIONABLE_TYPES.indexOf(reactTo.type) === -1) {
      return null
    }

    await addReactionData({ context: this.context, roomId, reaction, reactTo })
    return { ok: true as const }
  }

  /**
   * Remove a reaction from a reactionable item.
   * Does not reload the full room reaction store — callers emit a delta.
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

    return { ok: true as const }
  }
}
