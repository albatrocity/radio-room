import { createContext, useContext } from "react"
import type {
  GameAttributeName,
  GameSession,
  GiftOffer,
  ItemDefinition,
  TradeInvite,
  TradeSession,
  UserGameState,
  UserInventory,
} from "@repo/types"
import { getPluginUserState } from "../../lib/getPluginUserState"

/**
 * Snapshot of the current user's game state, exposed inside the
 * `ModalUserGameState` so plugin tabs can read coin balances, inventory
 * counts, modifiers, etc. without re-fetching `GET_MY_GAME_STATE`.
 */
export interface UserGameStateSnapshot {
  session: GameSession | null
  state: UserGameState | null
  inventory: UserInventory | null
  itemDefinitions: ItemDefinition[]
  pendingGifts?: { incoming: GiftOffer[]; outgoing: GiftOffer[] }
  pendingTradeInvites?: { incoming: TradeInvite[]; outgoing: TradeInvite[] }
  activeTrade?: TradeSession | null
  /**
   * Private per-user bag from a plugin that implements
   * `contributeToUserGameState` (ADR 0097).
   */
  getPluginState: <T extends Record<string, unknown>>(pluginName: string) => T | null
  /** Convenience lookup for a single attribute (e.g. `coin`). */
  getAttribute: (attribute: GameAttributeName) => number
}

export const UserGameStateContext = createContext<UserGameStateSnapshot | null>(null)

/**
 * Hook for consumers (built-in inventory tab, plugin tab content) to read
 * the current user's game state. Returns `null` when no snapshot is
 * available (modal closed or still loading).
 */
export function useUserGameState(): UserGameStateSnapshot | null {
  return useContext(UserGameStateContext)
}

export { getPluginUserState }
