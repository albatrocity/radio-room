import type { GameStateModifier } from "@repo/types"
import { getActiveFlags } from "./getActiveFlags"

/** Timed modifier flag: viewer may peek other inventories and pierce hidden identity (ADR 0149). */
export const INVENTORY_PEEK_FLAG = "inventory_peek"

export function hasInventoryPeek(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): boolean {
  return getActiveFlags(modifiers, now)[INVENTORY_PEEK_FLAG] === true
}
