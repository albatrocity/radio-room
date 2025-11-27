import { Emoji } from "@repo/types/Emoji"
import { Server } from "socket.io"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { User } from "@repo/types/User"
import { SocketWithContext } from "../lib/socketWithContext"
import { createActivityHandlers } from "../handlers/activityHandlersAdapter"

/**
 * Activity Controller - Manages user activity and reaction events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createActivityController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createActivityHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Update user status to listening
   */
  socket.on("START_LISTENING", async () => {
    console.log("START LISTENING SOCKET EVENT")
    await handlers.startListening(connections)
  })

  /**
   * Update user status to participating
   */
  socket.on("STOP_LISTENING", async () => {
    console.log("STOP LISTENING SOCKET EVENT")
    await handlers.stopListening(connections)
  })

  /**
   * Add a reaction to a reactionable item
   */
  socket.on(
    "ADD_REACTION",
    async ({ emoji, reactTo, user }: { emoji: Emoji; reactTo: ReactionSubject; user: User }) => {
      await handlers.addReaction(connections, { emoji, reactTo, user })
    },
  )

  /**
   * Remove a reaction from a reactionable item
   */
  socket.on(
    "REMOVE_REACTION",
    async ({ emoji, reactTo, user }: { emoji: Emoji; reactTo: ReactionSubject; user: User }) => {
      await handlers.removeReaction(connections, { emoji, reactTo, user })
    },
  )
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createActivityController instead
 */
export default createActivityController
