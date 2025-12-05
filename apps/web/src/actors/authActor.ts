/**
 * Auth Actor
 *
 * Singleton actor that manages authentication state.
 * Always active, subscribes to socket events for auth-related messages.
 */

import { interpret } from "xstate"
import { authMachine, AuthContext } from "../machines/authMachine"
import { subscribeActor } from "./socketActor"

// ============================================================================
// Actor Instance
// ============================================================================

export const authActor = interpret(authMachine).start()

// Subscribe to socket events
subscribeActor(authActor)

// ============================================================================
// Public API (for non-React usage)
// ============================================================================

/**
 * Get the current user from auth context.
 */
export function getCurrentUser() {
  return authActor.getSnapshot().context.currentUser
}

/**
 * Check if the current user is an admin.
 */
export function getIsAdmin(): boolean {
  return authActor.getSnapshot().context.isAdmin
}

/**
 * Check if the user is authenticated.
 */
export function getIsAuthenticated(): boolean {
  return authActor.getSnapshot().matches("authenticated")
}

/**
 * Get the full auth context.
 */
export function getAuthContext(): AuthContext {
  return authActor.getSnapshot().context
}

/**
 * Send an event to the auth actor.
 */
export function sendAuthEvent(event: Parameters<typeof authActor.send>[0]): void {
  authActor.send(event)
}

