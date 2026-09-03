import type { BingoCard } from "./PlaylistBingo"
import type { GameSession, UserGameState } from "./GameSession"
import type { GiftOffer } from "./Gift"
import type { ItemDefinition, UserInventory } from "./Inventory"
import type { PresentedIdentityGrant } from "./PresentedIdentity"
import type { ShoppingSessionInstance } from "./ShoppingSession"
import type { TradeInvite, TradeSession } from "./Trade"

/**
 * Payload for the socket-scoped `USER_GAME_STATE` / `GET_MY_GAME_STATE` response.
 *
 * Per-user plugin data lives in {@link pluginUserState}, keyed by plugin name.
 * Plugins contribute via `contributeToUserGameState` (ADR 0097).
 *
 * `itemDefinitions` is a **filtered** slice: inventory + modifier refs + plugin
 * extras (`referencedItemDefinitionIdsForUser`, e.g. shop offers) + pending
 * gift SKUs + active-trade draft/offer SKUs (escrowed and counterpart items
 * are not in the bag) — not the full room catalog.
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
  /** Pending gifts involving this user (ADR 0114). */
  pendingGifts?: {
    incoming: GiftOffer[]
    outgoing: GiftOffer[]
  }
  /** Pending trade invites involving this user (ADR 0115). */
  pendingTradeInvites?: {
    incoming: TradeInvite[]
    outgoing: TradeInvite[]
  }
  /** Open trade negotiation for this user, if any (ADR 0114). */
  activeTrade?: TradeSession | null
  /** Active presented-identity grant for this user (ADR 0150), if any. */
  presentedIdentity?: PresentedIdentityGrant | null
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
