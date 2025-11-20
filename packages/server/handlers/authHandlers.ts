import { HandlerConnections } from "@repo/types/HandlerConnections"
import { User } from "@repo/types/User"
import { createAuthHandlers } from "./authHandlersAdapter"

export async function checkPassword({ socket, io }: HandlerConnections, submittedPassword: string) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.checkPassword({ socket, io }, submittedPassword)
}

export async function submitPassword(
  { socket, io }: HandlerConnections,
  submittedPassword: string,
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.submitPassword({ socket, io }, submittedPassword)
}

export async function login(
  { socket, io }: HandlerConnections,
  {
    userId,
    username,
    password,
    roomId,
  }: {
    userId?: string
    username?: string
    password?: string
    roomId: string
  },
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.login({ socket, io }, { userId, username, password, roomId })
}

export async function changeUsername(
  { socket, io }: HandlerConnections,
  { userId, username }: { userId: User["userId"]; username: User["username"] },
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.changeUsername({ socket, io }, { userId, username })
}

export async function disconnect({ socket, io }: HandlerConnections) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.disconnect({ socket, io })
}

/**
 * Get user's authentication status for a specific service (generic)
 */
export async function getUserServiceAuth(
  { socket, io }: HandlerConnections,
  { userId, serviceName }: { userId?: string; serviceName: string },
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.getUserServiceAuth({ socket, io }, { userId, serviceName })
}

/**
 * Logout from a specific service (generic)
 */
export async function logoutServiceAuth(
  { socket, io }: HandlerConnections,
  { userId, serviceName }: { userId?: string; serviceName: string },
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.logoutServiceAuth({ socket, io }, { userId, serviceName })
}

/**
 * Get user's Spotify authentication status (deprecated - for backward compatibility)
 * @deprecated Use getUserServiceAuth with serviceName="spotify"
 */
export async function getUserSpotifyAuth(
  { socket, io }: HandlerConnections,
  { userId }: { userId?: string },
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.getUserSpotifyAuth({ socket, io }, { userId })
}

/**
 * Logout from Spotify auth (deprecated - for backward compatibility)
 * @deprecated Use logoutServiceAuth with serviceName="spotify"
 */
export async function logoutSpotifyAuth(
  { socket, io }: HandlerConnections,
  { userId }: { userId?: string } = {},
) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.logoutSpotifyAuth({ socket, io }, { userId })
}

export async function nukeUser({ socket, io }: HandlerConnections) {
  const { context } = socket
  const authHandlers = createAuthHandlers(context)
  return authHandlers.nukeUser({ socket, io })
}
