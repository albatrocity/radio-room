/**
 * Errors Actor
 *
 * Singleton actor that handles error events and displays toast notifications.
 * Subscribes to socket events for server-side errors.
 */

import { interpret } from "xstate"
import { errorHandlerMachine } from "../machines/errorHandlerMachine"
import { subscribeActor } from "./socketActor"

// ============================================================================
// Actor Instance
// ============================================================================

export const errorsActor = interpret(errorHandlerMachine).start()

// Subscribe to socket events for error notifications
subscribeActor(errorsActor)

// ============================================================================
// Public API
// ============================================================================

/**
 * Report an error to be displayed as a toast.
 */
export function reportError(error: {
  status: number
  error: string
  message: string
  duration?: number
  id?: string
}): void {
  errorsActor.send({ type: "ERROR_OCCURRED", data: error })
}

/**
 * Clear a specific error.
 */
export function clearError(error: { status: number; error: string; message: string }): void {
  errorsActor.send({ type: "CLEAR_ERROR", data: error })
}

/**
 * Get all current errors.
 */
export function getErrors() {
  return errorsActor.getSnapshot().context.errors
}
