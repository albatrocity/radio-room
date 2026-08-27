import type { InventoryItem } from "./Inventory"

/**
 * Escrowed player-to-player gift offer (ADR 0114).
 * Items leave the sender's bag while pending.
 */
export interface GiftOffer {
  offerId: string
  roomId: string
  fromUserId: string
  toUserId: string
  /** Snapshot used to credit the recipient (or refund the sender). */
  definitionId: string
  sourcePlugin: string
  originalItemId: string
  quantity: number
  metadata?: Record<string, unknown>
  /** Optional display name captured at offer time for UI. */
  itemName?: string
  createdAt: number
}

export type GiftActionResult = {
  success: boolean
  message?: string
  offer?: GiftOffer
  /** True when accept/list observed an expired offer that was refunded. */
  expired?: boolean
}

/** Public wire shape for pending gifts on USER_GAME_STATE / gift inbox. */
export type GiftOfferPublic = GiftOffer

export type { InventoryItem }
