import { Server } from "socket.io"
import { User } from "@repo/types/User"
import { Request, Response } from "express"
import { getUser } from "../operations/data"
import { SocketWithContext } from "../lib/socketWithContext"
import { createAuthHandlers } from "../handlers/authHandlersAdapter"

/**
 * Auth Controller - Manages authentication and user events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createAuthController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createAuthHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Check if submitted password is correct
   */
  socket.on("CHECK_PASSWORD", async (submittedPassword: string) => {
    await handlers.checkPassword(connections, submittedPassword)
  })

  /**
   * Submit password to join password-protected room
   */
  socket.on("SUBMIT_PASSWORD", async (data: { password: string; roomId: string }) => {
    await handlers.submitPassword(connections, data.password, data.roomId)
  })

  /**
   * User login event
   */
  socket.on(
    "LOGIN",
    async ({
      username,
      userId,
      password,
      roomId,
    }: {
      username: User["username"]
      userId: User["userId"]
      password?: string
      roomId: string
    }) => {
      await handlers.login(connections, { username, userId, password, roomId })
    },
  )

  /**
   * Change username
   */
  socket.on(
    "CHANGE_USERNAME",
    async ({ username, userId }: { username: User["username"]; userId: User["userId"] }) => {
      await handlers.changeUsername(connections, { username, userId })
    },
  )

  /**
   * Get service authentication status (generic)
   */
  socket.on(
    "GET_USER_SERVICE_AUTHENTICATION_STATUS",
    async ({ userId, serviceName }: { userId?: string; serviceName: string }) => {
      await handlers.getUserServiceAuth(connections, { userId, serviceName })
    },
  )

  /**
   * Logout from a service (generic)
   */
  socket.on(
    "LOGOUT_SERVICE",
    async ({ userId, serviceName }: { userId?: string; serviceName: string }) => {
      await handlers.logoutServiceAuth(connections, { userId, serviceName })
    },
  )

  /**
   * Get Spotify authentication status
   * @deprecated Use "GET_USER_SERVICE_AUTHENTICATION_STATUS" with serviceName: "spotify"
   */
  socket.on("GET_USER_SPOTIFY_AUTHENTICATION_STATUS", async ({ userId }) => {
    await handlers.getUserSpotifyAuth(connections, { userId })
  })

  /**
   * Logout from Spotify
   * @deprecated Use "LOGOUT_SERVICE" with serviceName: "spotify"
   */
  socket.on("LOGOUT_SPOTIFY", async (args: { userId?: string } = {}) => {
    const options = args ? { userId: args.userId } : { userId: "app" }
    await handlers.logoutSpotifyAuth(connections, options)
  })

  /**
   * Delete all user data
   */
  socket.on("NUKE_USER", async (args: { userId?: string } = {}) => {
    await handlers.nukeUser(connections)
  })

  /**
   * Handle user disconnect
   */
  socket.on("disconnect", async () => {
    await handlers.disconnect(connections)
  })

  /**
   * Handle user leaving
   */
  socket.on("USER_LEFT", async () => {
    await handlers.disconnect(connections)
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createAuthController instead
 */
export default createAuthController

/**
 * HTTP handler: Logout user from session
 */
export async function logout(req: Request, res: Response) {
  if (req.session.user?.userId) {
    // await disconnectFromSpotify(req.session.user.userId)
    req.session.destroy((err) => {
      if (err) {
        console.log("ERROR FROM authController/logout", err)
        res.status(500).send("Error logging out")
      } else {
        res.clearCookie("connect.sid")
        res.status(200).send("Logged out")
      }
    })
  }
}

/**
 * HTTP handler: Get current user session
 */
export async function me(req: Request, res: Response) {
  const { user } = req.session
  if (user) {
    const u = await getUser({ context: (req as any).context, userId: user.userId })
    res.status(200).send({
      user: u,
      isNewUser: !user.userId,
    })
  } else {
    res.status(401).send({ message: "Not logged in" })
  }
}
