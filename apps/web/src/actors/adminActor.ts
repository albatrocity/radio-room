/**
 * Admin Actor
 *
 * Singleton actor that manages admin actions.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when user becomes admin, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { adminMachine } from "../machines/adminMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const adminActor = createActor(adminMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Set room settings.
 */
export function setSettings(data: any): void {
  adminActor.send({ type: "SET_SETTINGS", data })
}

/**
 * Clear the playlist.
 */
export function clearPlaylist(): void {
  adminActor.send({ type: "CLEAR_PLAYLIST" })
}

/**
 * Delete the room.
 */
export function deleteRoom(id: string): void {
  adminActor.send({ type: "DELETE_ROOM", data: { id } })
}

/**
 * Deputize a user as DJ.
 */
export function deputizeDj(userId: string): void {
  adminActor.send({ type: "DEPUTIZE_DJ", userId })
}
