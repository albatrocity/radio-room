import { AuthService } from "../services/AuthService"
import { HandlerConnections, AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { getRoomPath } from "../lib/getRoomPath"
import sendMessage from "../lib/sendMessage"

/**
 * Socket.io adapter for the AuthService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class AuthHandlers {
  constructor(private authService: AuthService) {}

  /**
   * Check if a password is required for a room and if the submitted password matches
   */
  checkPassword = async ({ socket, io }: HandlerConnections, submittedPassword: string) => {
    const result = await this.authService.checkPassword(socket.data.roomId, submittedPassword)

    socket.emit("event", {
      type: "SET_PASSWORD_REQUIREMENT",
      data: {
        passwordRequired: result.passwordRequired,
        passwordAccepted: result.passwordAccepted,
      },
    })
  }

  /**
   * Submit a password for a room
   */
  submitPassword = async (
    { socket, io }: HandlerConnections,
    submittedPassword: string,
    roomId: string,
  ) => {
    const result = await this.authService.submitPassword(
      roomId,
      submittedPassword,
      socket.data.userId,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    socket.emit("event", {
      type: "SET_PASSWORD_ACCEPTED",
      data: {
        passwordAccepted: result.passwordAccepted,
      },
    })
  }

  /**
   * Login a user to a room
   */
  login = async (
    { socket, io }: HandlerConnections,
    {
      userId: incomingUserId,
      username: incomingUsername,
      password,
      roomId,
    }: {
      userId?: string
      username?: string
      password?: string
      roomId: string
    },
  ) => {
    const session = socket.request.session

    const result = await this.authService.login({
      incomingUserId,
      incomingUsername,
      password,
      roomId,
      socketId: socket.id,
      sessionUser: session.user,
    })

    if (result.error) {
      // If login failed due to incorrect password, send unauthorized instead of errorOccurred
      // so the frontend can show the password prompt instead of an error toast
      if (result.error.status === 401) {
        socket.emit("event", {
          type: "UNAUTHORIZED",
        })
        return
      }

      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    // Stuff some important data into the socket
    socket.data.username = result.userData.username
    socket.data.userId = result.userData.userId
    socket.data.roomId = roomId

    // Save some user details to the session
    session.user = {
      userId: result.userData.userId,
      username: result.userData.username,
      id: socket.id,
    }
    session.save()

    // Join the room
    socket.join(getRoomPath(roomId))

    // Emit join event
    io.to(getRoomPath(roomId)).emit("event", {
      type: "USER_JOINED",
      data: {
        roomId,
        user: result.newUser,
        users: result.newUsers,
      },
    })

    // Send init data to user
    socket.emit("event", {
      type: "INIT",
      data: result.initData,
    })
  }

  /**
   * Change a user's username
   */
  changeUsername = async (
    { socket, io }: HandlerConnections,
    { userId, username }: { userId: User["userId"]; username: User["username"] },
  ) => {
    if (!username) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: "Username cannot be empty",
      })
      return
    }

    const result = await this.authService.changeUsername(userId, username, socket.data.roomId)

    if (!result.success) {
      return
    }

    socket.request.session.user = result.newUser
    socket.request.session.save()

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "USER_JOINED",
      data: {
        roomId: socket.data.roomId,
        users: result.newUsers,
        user: result.newUser,
      },
    })

    // send system message of username change if provided
    if (result.systemMessage) {
      sendMessage(io, socket.data.roomId, result.systemMessage, socket.context)
    }
  }

  /**
   * Handle user disconnection
   */
  disconnect = async ({ socket, io }: HandlerConnections) => {
    const result = await this.authService.disconnect(
      socket.data.roomId,
      socket.data.userId,
      socket.data.username,
    )

    socket.leave(getRoomPath(socket.data.roomId))

    // Emit via SystemEvents so plugins receive USER_LEFT
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(socket.data.roomId, "USER_LEFT", {
        roomId: socket.data.roomId,
        user: { userId: socket.data.userId, username: result.username },
        users: result.users,
      })
    }
  }

  /**
   * Get user's authentication status for a specific service (generic)
   */
  getUserServiceAuth = async (
    { socket, io }: HandlerConnections,
    { userId, serviceName }: { userId?: string; serviceName: string },
  ) => {
    const result = await this.authService.getUserServiceAuth(
      userId ?? socket.data.userId,
      serviceName,
    )

    io.to(socket.id).emit("event", {
      type: "SERVICE_AUTHENTICATION_STATUS",
      data: {
        isAuthenticated: result.isAuthenticated,
        accessToken: "accessToken" in result ? result.accessToken : undefined,
        serviceName: result.serviceName,
      },
    })
  }

  /**
   * Logout from a specific service (generic)
   */
  logoutServiceAuth = async (
    { socket, io }: HandlerConnections,
    { userId, serviceName }: { userId?: string; serviceName: string },
  ) => {
    const result = await this.authService.logoutServiceAuth(
      userId ?? socket.data.userId,
      serviceName,
    )

    if (result.success) {
      io.to(socket.id).emit("event", {
        type: "SERVICE_LOGOUT_SUCCESS",
        data: { serviceName },
      })
    } else {
      io.to(socket.id).emit("event", {
        type: "SERVICE_LOGOUT_FAILURE",
        data: { serviceName, error: result.error },
      })
    }
  }

  /**
   * Get user's Spotify authentication status (deprecated - for backward compatibility)
   * @deprecated Use getUserServiceAuth with serviceName="spotify"
   */
  getUserSpotifyAuth = async (
    { socket, io }: HandlerConnections,
    { userId }: { userId?: string },
  ) => {
    const result = await this.authService.getUserSpotifyAuth(userId ?? socket.data.userId)

    io.to(socket.id).emit("event", {
      type: "SPOTIFY_AUTHENTICATION_STATUS",
      data: {
        isAuthenticated: result.isAuthenticated,
        accessToken: "accessToken" in result ? result.accessToken : undefined,
      },
    })
  }

  /**
   * Logout from Spotify auth (deprecated - for backward compatibility)
   * @deprecated Use logoutServiceAuth with serviceName="spotify"
   */
  logoutSpotifyAuth = async (
    { socket, io }: HandlerConnections,
    { userId }: { userId?: string } = {},
  ) => {
    await this.authService.logoutSpotifyAuth(userId ?? socket.data.userId)
  }

  /**
   * Completely nuke a user's data
   */
  nukeUser = async ({ socket, io }: HandlerConnections) => {
    const userId = socket.data.userId ?? socket.request.session.user?.userId

    await this.authService.nukeUser(userId)

    socket.emit("SESSION_ENDED")
    socket.request.session.destroy((err) => {})
  }
}

/**
 * Factory function to create Auth handlers
 */
export function createAuthHandlers(context: AppContext) {
  const authService = new AuthService(context)
  return new AuthHandlers(authService)
}
