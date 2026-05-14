/**
 * Admin listener game state actor
 *
 * Singleton for the admin "all listeners" tab. Activate only while that tab
 * is visible (see ModalUserGameState).
 */

import { createActor } from "xstate"
import {
  adminListenerStateMachine,
  type AllListenerGameStatesPayload,
} from "../machines/adminListenerStateMachine"

export const adminListenerStateActor = createActor(adminListenerStateMachine).start()

export type { AllListenerGameStatesPayload }

/** Request a fresh fetch (e.g. manual refresh). */
export function refreshAdminListenerState(): void {
  adminListenerStateActor.send({ type: "REFRESH" })
}

export function getAdminListenerPayload(): AllListenerGameStatesPayload | null {
  return adminListenerStateActor.getSnapshot().context.payload
}

export function getAdminListenerError(): string | null {
  return adminListenerStateActor.getSnapshot().context.error
}
