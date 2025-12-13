import { SocketWithContext } from "../lib/socketWithContext"

/**
 * Lobby Controller - Manages lobby socket channel subscriptions
 *
 * The lobby channel allows clients to receive real-time updates about
 * all rooms (user counts, now playing) without joining individual rooms.
 * This is used by the public lobby page to show live room previews.
 */
export function createLobbyController(socket: SocketWithContext): void {
  /**
   * Join the lobby channel to receive room updates
   */
  socket.on("JOIN_LOBBY", () => {
    socket.join("lobby")
    console.log(`[Lobby] Socket ${socket.id} joined lobby channel`)
  })

  /**
   * Leave the lobby channel
   */
  socket.on("LEAVE_LOBBY", () => {
    socket.leave("lobby")
    console.log(`[Lobby] Socket ${socket.id} left lobby channel`)
  })
}
