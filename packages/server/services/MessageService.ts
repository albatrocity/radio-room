import { AppContext } from "@repo/types"
import { parseMessage } from "../lib/parseMessage"
import { getRoomPath } from "../lib/getRoomPath"
import {
  clearMessages as clearMessagesData,
  getUser,
  addTypingUser,
  getTypingUsers,
  removeTypingUser,
} from "../operations/data"
import { User } from "@repo/types/User"
import { resolveActorPresentedIdentity } from "../operations/presentedIdentity"

/**
 * A service that handles message-related operations without Socket.io dependencies
 */
export class MessageService {
  constructor(private context: AppContext) {}

  /**
   * Processes a new message
   */
  async processNewMessage(
    roomId: string,
    userId: string,
    username: string,
    message: string,
    options?: { presentedUsername?: string },
  ) {
    const user = await getUser({ context: this.context, userId })
    const { content, mentions } = parseMessage({ context: this.context, roomId, message })

    const fallbackUser: User = {
      username,
      userId,
    }

    const baseUser = user ?? fallbackUser
    const presentedLabel =
      options?.presentedUsername ??
      (
        await resolveActorPresentedIdentity({
          context: this.context,
          roomId,
          userId,
          // Chat is the hottest server path: hand over the user we just read so
          // the resolver skips a second `HGETALL user:{id}`. The fallback here
          // mirrors what the resolver would compute on its own.
          trueUsername: user?.username?.trim() || userId,
        })
      ).label

    const payloadUser = {
      ...baseUser,
      username: presentedLabel,
    }

    const payload = {
      user: payloadUser,
      content,
      mentions,
      timestamp: new Date().toISOString(),
    }

    await this.removeUserFromTyping(roomId, userId)
    const typing = await this.getTypingUsers(roomId)

    return {
      message: payload,
      typing,
      roomPath: getRoomPath(roomId),
    }
  }

  /**
   * Clears all messages for a room
   */
  async clearAllMessages(roomId: string) {
    await clearMessagesData({ context: this.context, roomId })
    return {
      roomPath: getRoomPath(roomId),
    }
  }

  /**
   * Adds a user to the typing list
   */
  async addUserToTyping(roomId: string, userId: string) {
    if (userId) {
      await addTypingUser({ context: this.context, roomId, userId })
    }

    const typing = await getTypingUsers({ context: this.context, roomId })

    return {
      typing,
      roomPath: getRoomPath(roomId),
    }
  }

  /**
   * Removes a user from the typing list
   */
  async removeUserFromTyping(roomId: string, userId: string) {
    await removeTypingUser({ context: this.context, roomId, userId })
    const typing = await getTypingUsers({ context: this.context, roomId })

    return {
      typing,
      roomPath: getRoomPath(roomId),
    }
  }

  /**
   * Gets the current typing users for a room
   */
  async getTypingUsers(roomId: string) {
    return getTypingUsers({ context: this.context, roomId })
  }
}
