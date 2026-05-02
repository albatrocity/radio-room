/**
 * User Game State Actor
 *
 * Manages the current user's game state (session, attributes, inventory).
 * Subscribes to socket events and re-fetches on relevant changes.
 *
 * Send ACTIVATE on room entry, DEACTIVATE on room exit (see roomLifecycle).
 * Send REFRESH when the modal opens to ensure fresh data.
 */

import { createActor } from "xstate"
import type { GameSession, ItemDefinition, UserGameState, UserInventory } from "@repo/types"
import {
  userGameStateMachine,
  type UserGameStatePayload,
} from "../machines/userGameStateMachine"

export const userGameStateActor = createActor(userGameStateMachine).start()

export type { UserGameStatePayload }

/** Request a fresh fetch of the user's game state. */
export function refreshUserGameState(): void {
  userGameStateActor.send({ type: "REFRESH" })
}

/** Current payload (session, state, inventory, itemDefinitions). */
export function getUserGameStatePayload(): UserGameStatePayload | null {
  return userGameStateActor.getSnapshot().context.payload
}

/** Whether the actor is currently loading. */
export function isUserGameStateLoading(): boolean {
  const state = userGameStateActor.getSnapshot().value
  return state === "loading" || state === "refreshing"
}

/** Current error message, if any. */
export function getUserGameStateError(): string | null {
  return userGameStateActor.getSnapshot().context.error
}

/** Active game session from the user's game state. */
export function getGameSession(): GameSession | null {
  return getUserGameStatePayload()?.session ?? null
}

/** User's current game state (attributes, modifiers). */
export function getUserState(): UserGameState | null {
  return getUserGameStatePayload()?.state ?? null
}

/** User's current inventory. */
export function getUserInventory(): UserInventory | null {
  return getUserGameStatePayload()?.inventory ?? null
}

/** Item definitions for items the user owns. */
export function getItemDefinitions(): ItemDefinition[] {
  return getUserGameStatePayload()?.itemDefinitions ?? []
}
