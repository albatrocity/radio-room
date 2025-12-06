/**
 * Users Actor
 *
 * Singleton actor that manages users/listeners state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { usersMachine } from "../machines/usersMachine"
import { User } from "../types/User"

// ============================================================================
// Actor Instance
// ============================================================================

export const usersActor = createActor(usersMachine).start()

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
