/**
 * Modals Actor
 *
 * Singleton actor that manages modal/dialog state.
 * Always active, controls which modal is currently open.
 */

import { createActor } from "xstate"
import { modalsMachine, Event as ModalsEvent } from "../machines/modalsMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const modalsActor = createActor(modalsMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a specific modal is currently open.
 */
export function isModalOpen(modalName: string): boolean {
  return modalsActor.getSnapshot().matches(modalName)
}

/**
 * Check if any modal is currently open.
 */
export function isAnyModalOpen(): boolean {
  return !modalsActor.getSnapshot().matches("closed")
}

/**
 * Get current modal state value.
 */
export function getCurrentModal(): string {
  const state = modalsActor.getSnapshot()
  if (typeof state.value === "string") {
    return state.value
  }
  // Handle nested states (like settings.overview)
  return JSON.stringify(state.value)
}

/**
 * Send an event to the modals actor.
 */
export function sendModalsEvent(event: ModalsEvent): void {
  modalsActor.send(event)
}

/**
 * Close the currently open modal.
 */
export function closeModal(): void {
  modalsActor.send({ type: "CLOSE" })
}
