/**
 * Metadata Preference Actor
 *
 * Singleton actor that manages user's preferred metadata source.
 * Always active, persists preference selection to session storage.
 */

import { createActor } from "xstate"
import {
  metadataPreferenceMachine,
  metadataSourceDisplayNames,
} from "../machines/metadataPreferenceMachine"
import { MetadataSourceType } from "../types/Queue"

// ============================================================================
// Actor Instance
// ============================================================================

export const metadataPreferenceActor = createActor(metadataPreferenceMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current preferred metadata source.
 */
export function getPreferredSource(): MetadataSourceType | undefined {
  return metadataPreferenceActor.getSnapshot().context.preferredSource
}

/**
 * Get the available metadata sources for the current room.
 */
export function getAvailableSources(): MetadataSourceType[] {
  return metadataPreferenceActor.getSnapshot().context.availableSources
}

/**
 * Set the available metadata sources (typically called when room data is loaded).
 */
export function setAvailableSources(sources: MetadataSourceType[]): void {
  metadataPreferenceActor.send({ type: "SET_AVAILABLE_SOURCES", sources })
}

/**
 * Set the user's preferred metadata source.
 */
export function setPreferredSource(source: MetadataSourceType): void {
  metadataPreferenceActor.send({ type: "SET_PREFERRED_SOURCE", source })
}

/**
 * Clear the user's preference (reset to first available).
 */
export function clearPreference(): void {
  metadataPreferenceActor.send({ type: "CLEAR_PREFERENCE" })
}

// Re-export display names for convenience
export { metadataSourceDisplayNames }

