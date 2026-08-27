import type { InventoryItem, ItemDefinition } from "./Inventory"

export type TradeStatus = "open" | "completed" | "cancelled"

/** Pending trade invite (ADR 0115). Not a session — no escrow, no byUserKey. */
export interface TradeInvite {
  inviteId: string
  roomId: string
  fromUserId: string
  toUserId: string
  createdAt: number
}

export type TradeOfferItem = {
  /** Escrowed stack identity (new id after lock debit). Empty while draft-only. */
  escrowKey: string
  originalItemId: string
  definitionId: string
  sourcePlugin: string
  quantity: number
  metadata?: Record<string, unknown>
  itemName?: string
  slotPool: "inventory" | "collection"
}

export type TradeDraftItem = {
  itemId: string
  quantity: number
  definitionId: string
  itemName?: string
  slotPool: "inventory" | "collection"
}

export type TradeParticipantState = {
  userId: string
  /** Selected items before lock (still in bag). */
  draft: TradeDraftItem[]
  /** Escrowed items after lock. */
  offer: TradeOfferItem[]
  locked: boolean
  confirmed: boolean
  /** Latest sticky note for this party (ADR 0116). Null/omit = none. */
  message?: string | null
}

/** Max length for a trade sticky note (characters). */
export const TRADE_MESSAGE_MAX_LENGTH = 160

/**
 * Two-party trade session (ADR 0114).
 * Items move into escrow when a party locks.
 */
export interface TradeSession {
  tradeId: string
  roomId: string
  status: TradeStatus
  /** Invite initiator. */
  fromUserId: string
  /** Invitee. */
  toUserId: string
  participants: Record<string, TradeParticipantState>
  createdAt: number
  updatedAt: number
}

export type TradeInventoryTransfer = {
  fromUserId: string
  toUserId: string
  item: InventoryItem
  quantity: number
}

export type TradeActionResult = {
  success: boolean
  message?: string
  trade?: TradeSession
  invite?: TradeInvite
  transfers?: TradeInventoryTransfer[]
}

export type { InventoryItem, ItemDefinition }
