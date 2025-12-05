/**
 * Users Actor
 *
 * Singleton actor that manages users/listeners state.
 * Active in room, subscribes to socket events for user updates.
 */

import { createActor } from "xstate"
import { usersMachine } from "../machines/usersMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { User } from "../types/User"

// ============================================================================
// Actor Instance
// ============================================================================

export const usersActor = createActor(usersMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribeUsersActor(): void {
  if (!isSubscribed) {
    subscribeActor(usersActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeUsersActor(): void {
  if (isSubscribed) {
    unsubscribeActor(usersActor)
    isSubscribed = false
  }
}

/**
 * Reset users state. Called when leaving a room.
 */
export function resetUsers(): void {
  usersActor.send({ type: "SET_USERS", data: { users: [] } })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all users in the room.
 */
export function getUsers(): User[] {
  return usersActor.getSnapshot().context.users
}

/**
 * Get listeners (non-DJ users).
 */
export function getListeners(): User[] {
  return usersActor.getSnapshot().context.listeners
}

/**
 * Get the current DJ.
 */
export function getDj(): User | null {
  return usersActor.getSnapshot().context.dj
}

/**
 * Get a user by ID.
 */
export function getUserById(userId: string): User | undefined {
  return usersActor.getSnapshot().context.users.find((u) => u.userId === userId)
}

