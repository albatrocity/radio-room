/**
 * DJ Actor
 *
 * Singleton actor that manages DJ state.
 * Active in jukebox rooms, subscribes to socket events.
 */

import { createActor } from "xstate"
import { djMachine } from "../machines/djMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"

// ============================================================================
// Actor Instance
// ============================================================================

export const djActor = createActor(djMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a jukebox room.
 */
export function subscribeDjActor(): void {
  if (!isSubscribed) {
    subscribeActor(djActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeDjActor(): void {
  if (isSubscribed) {
    unsubscribeActor(djActor)
    isSubscribed = false
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if currently DJing.
 */
export function isDjaying(): boolean {
  return djActor.getSnapshot().matches("djaying")
}

/**
 * Check if currently a deputy DJ.
 */
export function isDeputyDjaying(): boolean {
  return djActor.getSnapshot().matches("deputyDjaying")
}

/**
 * Check if can add to queue (is DJ or deputy DJ).
 */
export function canAddToQueue(): boolean {
  const state = djActor.getSnapshot()
  return state.matches("djaying") || state.matches("deputyDjaying")
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

