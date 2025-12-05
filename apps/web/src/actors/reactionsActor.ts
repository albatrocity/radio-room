/**
 * Reactions Actor
 *
 * Singleton actor that manages all reactions state (for messages and tracks).
 * Active in room, subscribes to socket events for reaction updates.
 */

import { interpret } from "xstate"
import { allReactionsMachine, ReactionsContext } from "../machines/allReactionsMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

// ============================================================================
// Actor Instance
// ============================================================================

export const reactionsActor = interpret(allReactionsMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribeReactionsActor(): void {
  if (!isSubscribed) {
    subscribeActor(reactionsActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeReactionsActor(): void {
  if (isSubscribed) {
    unsubscribeActor(reactionsActor)
    isSubscribed = false
  }
}

/**
 * Reset reactions state. Called when leaving a room.
 */
export function resetReactions(): void {
  reactionsActor.send({
    type: "INIT",
    data: { reactions: { message: {}, track: {} } },
  })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all reactions.
 */
export function getAllReactions(): ReactionsContext {
  return reactionsActor.getSnapshot().context.reactions
}

/**
 * Get reactions for a specific subject type.
 */
export function getReactionsByType(type: ReactionSubject["type"]): Record<string, Reaction[]> {
  return reactionsActor.getSnapshot().context.reactions[type] || {}
}

/**
 * Get reactions for a specific subject.
 */
export function getReactionsFor(
  type: ReactionSubject["type"],
  id: ReactionSubject["id"],
): Reaction[] {
  return reactionsActor.getSnapshot().context.reactions[type]?.[id] || []
}
