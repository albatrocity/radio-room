/**
 * Shape-agnostic accessors for GET_MY_GAME_STATE characterization tests.
 * This is the ONLY place that knows the wire shape of plugin per-user fields.
 * Update here when migrating from top-level fields to `pluginUserState`.
 */

import type { BingoCard, ShoppingSessionInstance } from "@repo/types"

/** Loose payload shape accepted by both pre- and post-refactor wire formats. */
export type GameStatePayloadLike = {
  session: unknown
  state: unknown
  inventory: unknown
  itemDefinitions: unknown[]
  currentShopInstance?: ShoppingSessionInstance | null
  bingoCard?: BingoCard | null
  pluginUserState?: Record<string, Record<string, unknown>>
}

export function readShopInstance(
  payload: GameStatePayloadLike,
): ShoppingSessionInstance | null {
  if (payload.pluginUserState) {
    const bag = payload.pluginUserState["item-shops"]
    return (bag?.currentShopInstance as ShoppingSessionInstance | null | undefined) ?? null
  }
  return payload.currentShopInstance ?? null
}

export function readBingoCard(payload: GameStatePayloadLike): BingoCard | null {
  if (payload.pluginUserState) {
    const bag = payload.pluginUserState["playlist-bingo"]
    return (bag?.card as BingoCard | null | undefined) ?? null
  }
  return payload.bingoCard ?? null
}
