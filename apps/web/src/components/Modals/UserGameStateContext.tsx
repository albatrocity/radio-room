import { createContext, useContext } from "react"
import type {
  GameAttributeName,
  GameSession,
  ItemDefinition,
  UserGameState,
  UserInventory,
} from "@repo/types"

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
