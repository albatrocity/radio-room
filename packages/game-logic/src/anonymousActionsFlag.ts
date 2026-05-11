import type { GameStateModifier } from "@repo/types"
import { getActiveFlags } from "./getActiveFlags"

/** Timed modifier flag: room-visible item actions attribute as "Someone". */
export const ANONYMOUS_ACTIONS_FLAG = "anonymous_actions"

export function hasAnonymousActions(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): boolean {
  return getActiveFlags(modifiers, now)[ANONYMOUS_ACTIONS_FLAG] === true
}
