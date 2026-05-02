/**
 * Room Game State Actor
 *
 * Holds the active game session's modifier state for *every* participant in
 * the current room, indexed by userId. Used by per-user effect bar UIs.
 *
 * Send ACTIVATE on room entry, DEACTIVATE on room exit (see roomLifecycle).
 */

import type { GameStateModifier } from "@repo/types"
import { createActor } from "xstate"
import { roomGameStateMachine } from "../machines/roomGameStateMachine"

export const roomGameStateActor = createActor(roomGameStateMachine).start()

const EMPTY_MODIFIERS: GameStateModifier[] = []

/** Read the latest modifiers for a given user (referentially-stable empty fallback). */
export function getModifiersForUser(userId: string): GameStateModifier[] {
  if (!userId) return EMPTY_MODIFIERS
  return roomGameStateActor.getSnapshot().context.modifiersByUserId[userId] ?? EMPTY_MODIFIERS
}

/** The active session id known to the room game state actor (or null). */
export function getRoomGameStateSessionId(): string | null {
  return roomGameStateActor.getSnapshot().context.sessionId
}
