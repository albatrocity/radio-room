/**
 * Reactions Actor
 *
 * Singleton actor that manages all reactions state (for messages and tracks).
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { allReactionsMachine, ReactionsContext } from "../machines/allReactionsMachine"
import { Reaction } from "../types/Reaction"
import { ReactionSubject } from "../types/ReactionSubject"

// ============================================================================
// Actor Instance
// ============================================================================

export const reactionsActor = createActor(allReactionsMachine).start()

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
