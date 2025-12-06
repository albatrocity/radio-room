/**
 * Metadata Source Auth Actor
 *
 * Singleton actor that manages metadata source (e.g., Spotify) authentication state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when metadata source features are needed, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { metadataSourceAuthMachine } from "../machines/metadataSourceAuthMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const metadataSourceAuthActor = createActor(metadataSourceAuthMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if metadata source is authenticated.
 */
export function isMetadataSourceAuthenticated(): boolean {
  return metadataSourceAuthActor.getSnapshot().matches({ active: "authenticated" })
}

/**
 * Check if authentication status is loading.
 */
export function isMetadataSourceLoading(): boolean {
  return metadataSourceAuthActor.getSnapshot().matches({ active: "loading" })
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
