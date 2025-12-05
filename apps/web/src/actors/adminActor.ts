/**
 * Admin Actor
 *
 * Singleton actor that manages admin actions.
 * Active when user is admin, subscribes to socket events.
 */

import { interpret } from "xstate"
import { adminMachine } from "../machines/adminMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"

// ============================================================================
// Actor Instance
// ============================================================================

export const adminActor = interpret(adminMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when user becomes admin.
 */
export function subscribeAdminActor(): void {
  if (!isSubscribed) {
    subscribeActor(adminActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeAdminActor(): void {
  if (isSubscribed) {
    unsubscribeActor(adminActor)
    isSubscribed = false
  }
}

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

