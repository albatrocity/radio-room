/**
 * DJ Actor
 *
 * Singleton actor that manages DJ state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a jukebox room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { djMachine } from "../machines/djMachine"

// ============================================================================
// Actor Instance
// ============================================================================

export const djActor = createActor(djMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if currently DJing.
 */
export function isDjaying(): boolean {
  return djActor.getSnapshot().matches({ active: "djaying" })
}

/**
 * Check if currently a deputy DJ.
 */
export function isDeputyDjaying(): boolean {
  return djActor.getSnapshot().matches({ active: "deputyDjaying" })
}

/**
 * Check if can add to queue (is DJ or deputy DJ).
 */
export function canAddToQueue(): boolean {
  const state = djActor.getSnapshot()
  return state.matches({ active: "djaying" }) || state.matches({ active: "deputyDjaying" })
}

/**
 * Start DJ session.
 */
export function startDjSession(): void {
  djActor.send({ type: "START_DJ_SESSION" })
}

/**
 * End DJ session.
 */
export function endDjSession(): void {
  djActor.send({ type: "END_DJ_SESSION" })
}

/**
 * Start deputy DJ session.
 */
export function startDeputyDjSession(): void {
  djActor.send({ type: "START_DEPUTY_DJ_SESSION" })
}

/**
 * End deputy DJ session.
 */
export function endDeputyDjSession(): void {
  djActor.send({ type: "END_DEPUTY_DJ_SESSION" })
}
