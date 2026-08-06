import type { BingoCard } from "./PlaylistBingo"
import type { GameSession, UserGameState } from "./GameSession"
import type { ItemDefinition, UserInventory } from "./Inventory"
import type { ShoppingSessionInstance } from "./ShoppingSession"

/**
 * Payload for the socket-scoped `USER_GAME_STATE` / `GET_MY_GAME_STATE` response.
 *
 * Per-user plugin data lives in {@link pluginUserState}, keyed by plugin name.
 * Plugins contribute via `contributeToUserGameState` (ADR 0094).
 */
export interface UserGameStatePayload {
  session: GameSession | null
  state: UserGameState | null
  inventory: UserInventory | null
  itemDefinitions: ItemDefinition[]
  /**
   * Per-plugin bag of private per-user state for the requesting user.
   * Keyed by plugin name (e.g. `"item-shops"`, `"playlist-bingo"`).
   */
  pluginUserState?: Record<string, Record<string, unknown>>
}

/** Context passed to `Plugin.contributeToUserGameState`. */
export interface ContributeToUserGameStateContext {
  /** Already-loaded room item definitions (avoid a second inventory fetch). */
  itemDefinitions: ItemDefinition[]
}

/** Well-known keys inside `pluginUserState["item-shops"]`. */
export type ItemShopsUserGameState = {
  currentShopInstance: ShoppingSessionInstance | null
}

/** Well-known keys inside `pluginUserState["playlist-bingo"]`. */
export type PlaylistBingoUserGameState = {
  card: BingoCard | null
}
