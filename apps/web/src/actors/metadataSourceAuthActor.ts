/**
 * Metadata Source Auth Actor
 *
 * Singleton actor that manages metadata source (e.g., Spotify) authentication state.
 * Active when DJ features are used, subscribes to socket events.
 */

import { createActor } from "xstate"
import { metadataSourceAuthMachine } from "../machines/metadataSourceAuthMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"

// ============================================================================
// Actor Instance
// ============================================================================

export const metadataSourceAuthActor = createActor(metadataSourceAuthMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when metadata source features are needed.
 */
export function subscribeMetadataSourceAuthActor(): void {
  if (!isSubscribed) {
    subscribeActor(metadataSourceAuthActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeMetadataSourceAuthActor(): void {
  if (isSubscribed) {
    unsubscribeActor(metadataSourceAuthActor)
    isSubscribed = false
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if metadata source is authenticated.
 */
export function isMetadataSourceAuthenticated(): boolean {
  return metadataSourceAuthActor.getSnapshot().matches("authenticated")
}

/**
 * Check if authentication status is loading.
 */
export function isMetadataSourceLoading(): boolean {
  return metadataSourceAuthActor.getSnapshot().matches("loading")
}

/**
 * Fetch authentication status from server.
 */
export function fetchMetadataSourceAuthStatus(): void {
  metadataSourceAuthActor.send({ type: "FETCH_STATUS" })
}

/**
 * Logout from metadata source.
 */
export function logoutMetadataSource(): void {
  metadataSourceAuthActor.send({ type: "LOGOUT" })
}

/**
 * Get the service name (e.g., "spotify").
 */
export function getServiceName(): string | undefined {
  return metadataSourceAuthActor.getSnapshot().context.serviceName
}

