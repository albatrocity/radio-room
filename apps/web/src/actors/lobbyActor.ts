/**
 * Lobby Actor
 *
 * Singleton actor that manages the lobby socket connection and room state.
 * Used by the public lobby page to show real-time room previews.
 *
 * Usage:
 * - Send CONNECT when entering the lobby page
 * - Send DISCONNECT when leaving the lobby page
 * - Use useLobbyRooms() hook to access room data
 */

import { createActor } from "xstate"
import { lobbyMachine, LobbyRoom, LobbyContext } from "../machines/lobbyMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const lobbyActor = createActor(lobbyMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current list of lobby rooms.
 */
export function getLobbyRooms(): LobbyRoom[] {
  return lobbyActor.getSnapshot().context.rooms
}

/**
 * Get lobby error if any.
 */
export function getLobbyError(): LobbyContext["error"] {
  return lobbyActor.getSnapshot().context.error
}

/**
 * Check if the lobby is connected and ready.
 */
export function isLobbyReady(): boolean {
  const state = lobbyActor.getSnapshot()
  return state.matches({ connected: "ready" })
}

/**
 * Check if the lobby is loading.
 */
export function isLobbyLoading(): boolean {
  const state = lobbyActor.getSnapshot()
  return state.matches({ connected: "loading" }) || state.matches("connecting")
}

/**
 * Connect to the lobby.
 */
export function connectLobby(): void {
  lobbyActor.send({ type: "CONNECT" })
}

/**
 * Disconnect from the lobby.
 */
export function disconnectLobby(): void {
  lobbyActor.send({ type: "DISCONNECT" })
}

/**
 * Refetch room data.
 */
export function refetchLobbyRooms(): void {
  lobbyActor.send({ type: "REFETCH" })
}
