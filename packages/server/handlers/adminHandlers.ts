import { HandlerConnections } from "@repo/types/HandlerConnections"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { createAdminHandlers } from "./adminHandlersAdapter"

/**
 * Get room settings for an admin
 */
export async function getRoomSettings({ io, socket }: HandlerConnections) {
  const { context } = socket
  const adminHandlers = createAdminHandlers(context)
  return adminHandlers.getRoomSettings({ io, socket })
}

/**
 * Set a room password
 */
export async function setPassword({ socket, io }: HandlerConnections, value: string) {
  const { context } = socket
  const adminHandlers = createAdminHandlers(context)
  return adminHandlers.setPassword({ socket, io }, value)
}

/**
 * Kick a user from a room
 */
export async function kickUser({ io, socket }: HandlerConnections, user: User) {
  const { context } = socket
  const adminHandlers = createAdminHandlers(context)
  return adminHandlers.kickUser({ io, socket }, user)
}

/**
 * Update room settings
 */
export async function setRoomSettings({ socket, io }: HandlerConnections, values: Partial<Room>) {
  const { context } = socket
  const adminHandlers = createAdminHandlers(context)
  return adminHandlers.setRoomSettings({ socket, io }, values)
}

/**
 * Clear a room's playlist
 */
export async function clearPlaylist({ socket, io }: HandlerConnections) {
  const { context } = socket
  const adminHandlers = createAdminHandlers(context)
  return adminHandlers.clearPlaylist({ socket, io })
}
