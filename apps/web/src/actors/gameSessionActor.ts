/**
 * Game Session Actor
 *
 * Tracks whether a game session is active in the current room. Subscribes to
 * room-broadcast `GAME_SESSION_STARTED` / `GAME_SESSION_ENDED` events and the
 * direct `USER_GAME_STATE` ack to seed initial state when joining a room mid-session.
 *
 * Send ACTIVATE on room entry, DEACTIVATE on room exit (see roomLifecycle).
 */

import { createActor } from "xstate"
import { gameSessionMachine } from "../machines/gameSessionMachine"

export const gameSessionActor = createActor(gameSessionMachine).start()

/** Active game session id for the current room, or null. */
export function getActiveGameSessionId(): string | null {
  return gameSessionActor.getSnapshot().context.activeSessionId
}

/** Active game session name (for tooltips / labels), or null. */
export function getActiveGameSessionName(): string | null {
  return gameSessionActor.getSnapshot().context.activeSessionName
}

/** Whether a game session is currently active for the current room. */
export function hasActiveGameSession(): boolean {
  return getActiveGameSessionId() != null
}
