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
      room?.deputizeOnJoin || (await isDj({ context: this.context, roomId, userId }))
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
    // Add user as DJ if auto-deputize is enabled OR if they were previously manually deputized
    if (isDeputyDj) {
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

    // Get access token for room creator to enable authenticated features (search, liked tracks, etc.)
    let accessToken: string | undefined = undefined
    if (isAdmin && room.metadataSourceId && this.context.data?.getUserServiceAuth) {
      try {
        const auth = await this.context.data.getUserServiceAuth({
          userId,
          serviceName: room.metadataSourceId,
        })
        accessToken = auth?.accessToken
        console.log(`Retrieved ${room.metadataSourceId} access token for room creator ${userId}`)
      } catch (error) {
        console.error(`Failed to retrieve access token for room creator ${userId}:`, error)
      }
    }

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
        accessToken, // Only set for room creator with metadata source
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
   * Get user's authentication status for a specific service
   */
  async getUserServiceAuth(userId: string, serviceName: string) {
    const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)

    if (!serviceAuthAdapter) {
      return {
        isAuthenticated: false,
        serviceName,
        error: `Service "${serviceName}" not found`,
      }
    }

    return await serviceAuthAdapter.getAuthStatus(userId)
  }

  /**
   * Logout from a specific service
   */
  async logoutServiceAuth(userId: string, serviceName: string) {
    const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)

    if (!serviceAuthAdapter) {
      return {
        success: false,
        error: `Service "${serviceName}" not found`,
      }
    }

    await serviceAuthAdapter.logout(userId)
    return { success: true }
  }

  /**
   * Get user's Spotify authentication status (deprecated - use getUserServiceAuth)
   * @deprecated Use getUserServiceAuth(userId, "spotify") instead
   */
  async getUserSpotifyAuth(userId: string) {
    return this.getUserServiceAuth(userId, "spotify")
  }

  /**
   * Logout from Spotify auth (deprecated - use logoutServiceAuth)
   * @deprecated Use logoutServiceAuth(userId, "spotify") instead
   */
  async logoutSpotifyAuth(userId: string) {
    return this.logoutServiceAuth(userId, "spotify")
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
