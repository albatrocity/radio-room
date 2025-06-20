import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { isNullish, uniqueBy } from "remeda"
import {
  addOnlineUser,
  findRoom,
  getAllRoomReactions,
  getMessages,
  getRoomUsers,
  getUser,
  isDj,
  saveUser,
  removeOnlineUser,
  getRoomPlaylist,
  getRoomCurrent,
  updateUserAttributes,
  persistRoom,
  addDj,
  getUserRooms,
  expireUserIn,
  persistUser,
  deleteUser,
  nukeUserRooms,
} from "../operations/data"
import generateId from "../lib/generateId"
import generateAnonName from "../lib/generateAnonName"
import systemMessage from "../lib/systemMessage"
import { THREE_HOURS } from "../lib/constants"

/**
 * A service that handles authentication operations without Socket.io dependencies
 */
export class AuthService {
  constructor(private context: AppContext) {}

  /**
   * Check if a password matches for a room
   */
  passwordMatched(room: Room | null, password?: string, userId?: string) {
    if (userId === room?.creator) {
      return true
    }
    return !room?.password || room?.password === password
  }

  /**
   * Check if a password is required for a room and if the submitted password matches
   */
  async checkPassword(roomId: string, submittedPassword: string) {
    const room = await findRoom({ context: this.context, roomId })

    return {
      passwordRequired: room?.password ? true : false,
      passwordAccepted: room?.password ? submittedPassword === room?.password : true,
    }
  }

  /**
   * Submit a password for a room
   */
  async submitPassword(roomId: string, submittedPassword: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return {
        error: {
          message: "Room not found",
          status: 404,
        },
        passwordAccepted: false,
      }
    }

    return {
      passwordAccepted: this.passwordMatched(room, submittedPassword, userId),
      error: null,
    }
  }

  /**
   * Login a user to a room
   */
  async login({
    incomingUserId,
    incomingUsername,
    password,
    roomId,
    socketId,
    sessionUser,
  }: {
    incomingUserId?: string
    incomingUsername?: string
    password?: string
    roomId: string
    socketId: string
    sessionUser?: { userId?: string; username?: string }
  }) {
    const room = await findRoom({ context: this.context, roomId })

    // Throw an error if the room doesn't exist
    if (!room) {
      return {
        error: {
          message: "Room not found",
          status: 404,
        },
      }
    }

    // Retrieve or setup new user
    const existingUserId = incomingUserId ?? sessionUser?.userId
    const isNew = !incomingUserId && !existingUserId && !sessionUser?.username
    const userId = existingUserId ?? generateId()
    const existingUser = await getUser({ context: this.context, userId })
    const username =
      existingUser?.username ?? sessionUser?.username ?? incomingUsername ?? generateAnonName()

    // Throw an error if the room is password protected and the password is incorrect
    if (!this.passwordMatched(room, password, userId)) {
      return {
        error: {
          message: "Password is incorrect",
          status: 401,
        },
      }
    }

    // Get room-specific user properties
    const users = await getRoomUsers({ context: this.context, roomId })
    const isDeputyDj =
      room?.deputizeOnJoin ?? (await isDj({ context: this.context, roomId, userId }))
    const isAdmin = room?.creator === userId

    // Create a new user object
    const newUser = {
      username,
      userId,
      id: socketId,
      isDj: false,
      isDeputyDj,
      status: "participating" as const,
      connectedAt: new Date().toISOString(),
    }

    // Make sure users is an array
    const usersArray = Array.isArray(users) ? users : []
    const newUsers = uniqueBy([...usersArray, newUser], (u: any) => u.userId)

    // save data to redis
    await addOnlineUser({ context: this.context, roomId, userId })
    await saveUser({ context: this.context, userId, attributes: newUser })
    if (room.deputizeOnJoin) {
      await addDj({ context: this.context, roomId, userId })
    }

    // If the admin has logged in, remove expiration of room keys
    if (isAdmin) {
      await persistRoom({ context: this.context, roomId })
    }

    // remove expiration of user keys
    await persistUser({ context: this.context, userId })

    // Get initial data payload for user
    const messages = await getMessages({ context: this.context, roomId, offset: 0, size: 100 })
    const playlist = await getRoomPlaylist({ context: this.context, roomId })
    const meta = await getRoomCurrent({ context: this.context, roomId })
    const allReactions = await getAllRoomReactions({ context: this.context, roomId })

    // TODO: Get a stored access token for the correct service
    const accessToken = "dummy-access-token"

    return {
      initData: {
        users: newUsers,
        messages,
        meta,
        passwordRequired: !isNullish(room?.password),
        playlist,
        reactions: allReactions,
        user: {
          userId,
          username,
          status: "participating",
          isDeputyDj,
          isAdmin,
        },
        accessToken,
        isNewUser: isNew,
      },
      userData: {
        userId,
        username,
        socketId,
        roomId,
      },
      newUser,
      newUsers,
      error: null,
    }
  }

  /**
   * Change a user's username
   */
  async changeUsername(userId: string, username: string, roomId: string) {
    const user = await getUser({ context: this.context, userId })
    const room = await findRoom({ context: this.context, roomId })
    const oldUsername = user?.username

    if (!user) {
      return { success: false }
    }

    const { users: newUsers, user: newUser } = await updateUserAttributes({
      context: this.context,
      userId,
      attributes: { username },
      roomId,
    })

    if (!newUser) {
      return { success: false }
    }

    let systemMessageContent = null
    // Prepare system message of username change if setting is enabled
    if (room?.announceUsernameChanges) {
      systemMessageContent = systemMessage(`${oldUsername} transformed into ${username}`, {
        oldUsername,
        userId,
      })
    }

    return {
      success: true,
      newUser,
      newUsers,
      systemMessage: systemMessageContent,
    }
  }

  /**
   * Handle user disconnection
   */
  async disconnect(roomId: string, userId: string, username: string) {
    await removeOnlineUser({ context: this.context, roomId, userId })

    const users = await getRoomUsers({ context: this.context, roomId })
    const createdRooms = await getUserRooms({ context: this.context, userId })

    if (createdRooms.length === 0) {
      await expireUserIn({ context: this.context, userId, ms: THREE_HOURS })
    }

    return {
      username,
      users,
    }
  }

  /**
   * Get user's Spotify authentication status
   */
  async getUserSpotifyAuth(userId: string) {
    // TODO: Implement real Spotify auth checking
    const accessToken = "dummy-access-token"

    return {
      isAuthenticated: !!accessToken,
      accessToken,
    }
  }

  /**
   * Logout from Spotify auth
   */
  async logoutSpotifyAuth(userId: string) {
    // TODO: Implement real Spotify logout
    return { success: true }
  }

  /**
   * Completely nuke a user's data
   */
  async nukeUser(userId: string) {
    // TODO: Implement real Spotify disconnect
    // await disconnectFromSpotify(userId)
    await nukeUserRooms({ context: this.context, userId })
    await deleteUser({ context: this.context, userId })

    return { success: true }
  }
}
