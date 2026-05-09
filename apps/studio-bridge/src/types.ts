import type { ChatMessage } from "@repo/types/ChatMessage"
import type { GameSession, UserGameState } from "@repo/types/GameSession"
import type { InventoryItem, ItemDefinition } from "@repo/types/Inventory"
import type { QueueItem } from "@repo/types/Queue"
import type { ShoppingSessionInstance } from "@repo/types/ShoppingSession"
import type { User } from "@repo/types/User"

/** Serialized StudioRoom pushed from Game Studio via POST /sync */
export type BridgeSnapshot = {
  roomId: string
  users: User[]
  chat: ChatMessage[]
  queue: QueueItem[]
  activeSession: GameSession | null
  userStates: Record<string, UserGameState>
  inventories: Record<string, InventoryItem[]>
  itemDefinitions: ItemDefinition[]
  pluginConfigs: Record<string, Record<string, unknown>>
  shoppingByUser: Record<string, ShoppingSessionInstance | null>
}
