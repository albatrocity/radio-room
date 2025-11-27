import { Server } from "socket.io"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { SocketWithContext } from "../lib/socketWithContext"
import { createAdminHandlers } from "../handlers/adminHandlersAdapter"

/**
 * Admin Controller - Manages room administration events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createAdminController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createAdminHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Set or update room password
   */
  socket.on("SET_PASSWORD", async (value: string) => {
    await handlers.setPassword(connections, value)
  })

  /**
   * Kick a user from the room
   */
  socket.on("KICK_USER", async (user: User) => {
    await handlers.kickUser(connections, user)
  })

  /**
   * Update room settings
   */
  socket.on("SET_ROOM_SETTINGS", async (settings: Partial<Room>) => {
    await handlers.setRoomSettings(connections, settings)
  })

  /**
   * Clear the room's playlist
   */
  socket.on("CLEAR_PLAYLIST", async () => {
    await handlers.clearPlaylist(connections)
  })

  // TODO: Implement trigger events
  // socket.on("GET_TRIGGER_EVENTS", async () => {
  //   await handlers.getTriggerEvents(connections)
  // })
  // socket.on("SET_REACTION_TRIGGER_EVENTS", async (data) => {
  //   await handlers.setReactionTriggerEvents(connections, data)
  // })
  // socket.on("SET_MESSAGE_TRIGGER_EVENTS", async (data) => {
  //   await handlers.setMessageTriggerEvents(connections, data)
  // })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createAdminController instead
 */
export default createAdminController
