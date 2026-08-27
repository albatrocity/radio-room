import type {
  AppContext,
  InventoryItem,
  TradeActionResult,
  TradeDraftItem,
  TradeInvite,
  TradeOfferItem,
  TradeSession,
} from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS, TRADE_MESSAGE_MAX_LENGTH } from "@repo/types"
import generateId from "../lib/generateId"
import { InventoryService } from "./InventoryService"
import { canAccommodateOfferList, deliverOffer, refundEscrow } from "./trade/tradeEscrow"
import { TradeInviteStore } from "./trade/tradeInviteStore"
import {
  byUserKey,
  emptyParticipant,
  isInviteExpired,
  openTradesKey,
  slotPoolOf,
  tradeKey,
} from "./trade/tradeKeys"

/**
 * Two-party trade sessions with escrow on lock (ADR 0114).
 * Trade invites are a separate inbox layer (ADR 0115).
 * Domain events are emitted by `operations/inventory/tradeOps`.
 */
export class TradeService {
  private readonly invites: TradeInviteStore

  constructor(private readonly context: AppContext) {
    this.invites = new TradeInviteStore(this.context.redis, (invite) =>
      this.notifyInviteExpired(invite),
    )
  }

  private get inventory(): InventoryService | null {
    return (this.context.inventory as InventoryService | undefined) ?? null
  }

  private async notifyInviteExpired(invite: TradeInvite): Promise<void> {
    const { emitTradeInviteExpired } = await import("../operations/inventory/tradeOps")
    await emitTradeInviteExpired({ context: this.context, invite })
  }

  // ==========================================================================
  // Invites (ADR 0115)
  // ==========================================================================

  async getInvite(roomId: string, inviteId: string): Promise<TradeInvite | null> {
    return this.invites.getInvite(roomId, inviteId)
  }

  async listIncomingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.invites.listIncomingInvites(roomId, userId)
  }

  async listOutgoingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.invites.listOutgoingInvites(roomId, userId)
  }

  async invite(params: {
    roomId: string
    fromUserId: string
    toUserId: string
  }): Promise<TradeActionResult> {
    const { roomId, fromUserId, toUserId } = params
    if (fromUserId === toUserId) {
      return { success: false, message: "You can't trade with yourself" }
    }
    if (!(await this.assertTradingAllowed(roomId))) {
      return { success: false, message: "Trading is not enabled for this session" }
    }
    if (await this.getTradeForUser(roomId, fromUserId)) {
      return { success: false, message: "You already have an active trade" }
    }
    if (await this.getTradeForUser(roomId, toUserId)) {
      return { success: false, message: "That listener is already in a trade" }
    }

    const outgoing = await this.listOutgoingInvites(roomId, fromUserId)
    if (outgoing.length > 0) {
      return { success: false, message: "You already have a pending trade invite" }
    }

    const incomingToTarget = await this.listIncomingInvites(roomId, toUserId)
    if (incomingToTarget.some((i) => i.fromUserId === fromUserId)) {
      return { success: false, message: "You already sent a trade invite to that listener" }
    }

    const invite: TradeInvite = {
      inviteId: generateId(),
      roomId,
      fromUserId,
      toUserId,
      createdAt: Date.now(),
    }
    await this.invites.persistInvite(invite)
    return { success: true, message: "Trade invite sent", invite }
  }

  async respondInvite(params: {
    roomId: string
    userId: string
    inviteId: string
    accept: boolean
  }): Promise<TradeActionResult> {
    const invite = await this.getInvite(params.roomId, params.inviteId)
    if (!invite) return { success: false, message: "Trade invite not found" }
    if (isInviteExpired(invite, PLAYER_TRANSFER_TTL_MS)) {
      await this.invites.expireInvite(invite)
      await this.notifyInviteExpired(invite)
      return { success: false, message: "Trade invite expired" }
    }
    if (invite.toUserId !== params.userId) {
      return { success: false, message: "This invite is not for you" }
    }

    if (!params.accept) {
      await this.invites.deleteInvite(invite)
      return { success: true, message: "Trade declined", invite }
    }

    if (!(await this.assertTradingAllowed(params.roomId))) {
      await this.invites.deleteInvite(invite)
      return { success: false, message: "Trading is not enabled for this session" }
    }
    if (await this.getTradeForUser(params.roomId, invite.fromUserId)) {
      await this.invites.deleteInvite(invite)
      return { success: false, message: "The other listener is already in a trade" }
    }
    if (await this.getTradeForUser(params.roomId, invite.toUserId)) {
      await this.invites.deleteInvite(invite)
      return { success: false, message: "You already have an active trade" }
    }

    await this.invites.deleteInvite(invite)

    const now = Date.now()
    const trade: TradeSession = {
      tradeId: generateId(),
      roomId: invite.roomId,
      status: "open",
      fromUserId: invite.fromUserId,
      toUserId: invite.toUserId,
      participants: {
        [invite.fromUserId]: emptyParticipant(invite.fromUserId),
        [invite.toUserId]: emptyParticipant(invite.toUserId),
      },
      createdAt: now,
      updatedAt: now,
    }
    await this.persistTrade(trade)
    return { success: true, message: "Trade started", trade }
  }

  async cancelInvite(params: {
    roomId: string
    userId: string
    inviteId: string
  }): Promise<TradeActionResult> {
    const invite = await this.getInvite(params.roomId, params.inviteId)
    if (!invite) return { success: false, message: "Trade invite not found" }
    if (invite.fromUserId !== params.userId) {
      return { success: false, message: "Only the sender can cancel this invite" }
    }
    await this.invites.deleteInvite(invite)
    return { success: true, message: "Trade invite cancelled", invite }
  }

  async cancelInvitesForUser(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.invites.cancelInvitesForUser(roomId, userId)
  }

  async cancelInvitesForRoom(
    roomId: string,
    reason: "sender" | "session_end" | "user_left" | "trading_disabled" = "session_end",
  ): Promise<TradeInvite[]> {
    return this.invites.cancelInvitesForRoom(roomId, reason)
  }

  // ==========================================================================
  // Active sessions
  // ==========================================================================

  async getTrade(roomId: string, tradeId: string): Promise<TradeSession | null> {
    const raw = await this.context.redis.pubClient.get(tradeKey(roomId, tradeId))
    if (!raw) return null
    try {
      const trade = JSON.parse(raw) as TradeSession
      if (trade.status !== "open") return null
      return trade
    } catch {
      return null
    }
  }

  async getTradeForUser(roomId: string, userId: string): Promise<TradeSession | null> {
    const tradeId = await this.context.redis.pubClient.get(byUserKey(roomId, userId))
    if (!tradeId) return null
    return this.getTrade(roomId, tradeId)
  }

  async setOffer(params: {
    roomId: string
    userId: string
    tradeId: string
    items: { itemId: string; quantity: number }[]
  }): Promise<TradeActionResult> {
    const inv = this.inventory
    if (!inv) return { success: false, message: "Inventory unavailable" }

    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade) {
      return { success: false, message: "Trade is not open" }
    }
    const me = trade.participants[params.userId]
    if (!me) return { success: false, message: "You are not in this trade" }
    if (me.locked) {
      return { success: false, message: "Unlock before changing your offer" }
    }

    const bag = await inv.getInventory(params.roomId, params.userId)
    const byId = new Map(bag.items.map((i) => [i.itemId, i]))
    const draft: TradeDraftItem[] = []
    for (const row of params.items) {
      const qty = Math.max(1, Math.floor(row.quantity))
      const item = byId.get(row.itemId)
      if (!item) return { success: false, message: "Item not in your inventory" }
      const def = await inv.getItemDefinition(params.roomId, item.definitionId)
      if (!def?.tradeable) {
        return { success: false, message: `${def?.name ?? "Item"} can't be traded` }
      }
      if (qty > item.quantity) {
        return { success: false, message: "Not enough quantity" }
      }
      draft.push({
        itemId: row.itemId,
        quantity: qty,
        definitionId: item.definitionId,
        itemName: def.name,
        slotPool: slotPoolOf(def),
      })
    }

    me.draft = draft
    trade.participants[params.userId] = me
    trade.updatedAt = Date.now()
    await this.persistTrade(trade)
    return { success: true, message: "Offer updated", trade }
  }

  async setMessage(params: {
    roomId: string
    userId: string
    tradeId: string
    message: string
  }): Promise<TradeActionResult> {
    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade || trade.status !== "open") {
      return { success: false, message: "Trade is not open" }
    }
    const me = trade.participants[params.userId]
    if (!me) return { success: false, message: "You are not in this trade" }

    const trimmed = params.message.trim().slice(0, TRADE_MESSAGE_MAX_LENGTH)
    me.message = trimmed.length > 0 ? trimmed : null
    trade.participants[params.userId] = me
    trade.updatedAt = Date.now()
    await this.persistTrade(trade)
    return { success: true, message: trimmed ? "Note updated" : "Note cleared", trade }
  }

  async lock(params: {
    roomId: string
    userId: string
    tradeId: string
  }): Promise<TradeActionResult> {
    const inv = this.inventory
    if (!inv) return { success: false, message: "Inventory unavailable" }

    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade) {
      return { success: false, message: "Trade is not open" }
    }
    const me = trade.participants[params.userId]
    if (!me) return { success: false, message: "You are not in this trade" }
    if (me.locked) return { success: true, message: "Already locked", trade }

    try {
      return await inv.withInventoryLocks(params.roomId, [params.userId], async () => {
        const escrowed: TradeOfferItem[] = []
        for (const row of me.draft) {
          const raw = await this.context.redis.pubClient.hGet(
            `room:${params.roomId}:inventory:items:${params.userId}`,
            row.itemId,
          )
          if (!raw) {
            await refundEscrow({
              inventory: inv,
              roomId: params.roomId,
              userId: params.userId,
              offer: escrowed,
            })
            return { success: false, message: "An offered item is no longer available" }
          }
          let item: InventoryItem
          try {
            item = JSON.parse(raw) as InventoryItem
          } catch {
            await refundEscrow({
              inventory: inv,
              roomId: params.roomId,
              userId: params.userId,
              offer: escrowed,
            })
            return { success: false, message: "Item data corrupted" }
          }
          const def = await inv.getItemDefinition(params.roomId, item.definitionId)
          if (!def?.tradeable) {
            await refundEscrow({
              inventory: inv,
              roomId: params.roomId,
              userId: params.userId,
              offer: escrowed,
            })
            return { success: false, message: "An offered item can't be traded" }
          }
          const qty = Math.min(row.quantity, item.quantity)
          const removed = await inv.removeItem(params.roomId, params.userId, row.itemId, qty)
          if (!removed) {
            await refundEscrow({
              inventory: inv,
              roomId: params.roomId,
              userId: params.userId,
              offer: escrowed,
            })
            return { success: false, message: "Could not escrow offer" }
          }
          escrowed.push({
            escrowKey: generateId(),
            originalItemId: row.itemId,
            definitionId: item.definitionId,
            sourcePlugin: item.sourcePlugin,
            quantity: qty,
            metadata: item.metadata,
            itemName: def.name,
            slotPool: slotPoolOf(def),
          })
        }

        me.offer = escrowed
        me.draft = []
        me.locked = true
        me.confirmed = false
        for (const p of Object.values(trade.participants)) {
          if (p.userId !== params.userId) p.confirmed = false
        }
        trade.participants[params.userId] = me
        trade.updatedAt = Date.now()
        await this.persistTrade(trade)
        return { success: true, message: "Offer locked", trade }
      })
    } catch (err) {
      console.error("[TradeService] lock failed:", err)
      return { success: false, message: "Could not lock offer" }
    }
  }

  async unlock(params: {
    roomId: string
    userId: string
    tradeId: string
  }): Promise<TradeActionResult> {
    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade) {
      return { success: false, message: "Trade is not open" }
    }
    if (!trade.participants[params.userId]) {
      return { success: false, message: "You are not in this trade" }
    }

    for (const p of Object.values(trade.participants)) {
      await refundEscrow({
        inventory: this.inventory,
        roomId: params.roomId,
        userId: p.userId,
        offer: p.offer,
      })
      p.offer = []
      p.draft = []
      p.locked = false
      p.confirmed = false
    }
    trade.updatedAt = Date.now()
    await this.persistTrade(trade)
    return { success: true, message: "Trade unlocked", trade }
  }

  async confirm(params: {
    roomId: string
    userId: string
    tradeId: string
  }): Promise<TradeActionResult> {
    const inv = this.inventory
    if (!inv) return { success: false, message: "Inventory unavailable" }

    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade) {
      return { success: false, message: "Trade is not open" }
    }
    const me = trade.participants[params.userId]
    if (!me) return { success: false, message: "You are not in this trade" }
    if (!me.locked) return { success: false, message: "Lock your offer before confirming" }

    const parties = Object.values(trade.participants)
    if (!parties.every((p) => p.locked)) {
      return { success: false, message: "Both parties must lock before confirming" }
    }

    me.confirmed = true
    trade.participants[params.userId] = me
    trade.updatedAt = Date.now()

    const allConfirmed = Object.values(trade.participants).every((p) => p.confirmed)
    if (!allConfirmed) {
      await this.persistTrade(trade)
      return { success: true, message: "Waiting for the other listener", trade }
    }

    const [a, b] = Object.values(trade.participants)
    if (!a || !b) return { success: false, message: "Invalid trade" }

    if (a.offer.length === 0 && b.offer.length === 0) {
      for (const p of Object.values(trade.participants)) p.confirmed = false
      await this.persistTrade(trade)
      return { success: false, message: "Both offers are empty", trade }
    }

    try {
      return await inv.withInventoryLocks(params.roomId, [a.userId, b.userId], async () => {
        if (
          !(await canAccommodateOfferList({
            inventory: inv,
            roomId: params.roomId,
            userId: a.userId,
            incoming: b.offer,
          })) ||
          !(await canAccommodateOfferList({
            inventory: inv,
            roomId: params.roomId,
            userId: b.userId,
            incoming: a.offer,
          }))
        ) {
          for (const p of Object.values(trade.participants)) p.confirmed = false
          await this.persistTrade(trade)
          return {
            success: false,
            message: "Not enough inventory/collection space for this trade",
            trade,
          }
        }

        const transfers = [
          ...(await deliverOffer({
            inventory: inv,
            roomId: params.roomId,
            fromUserId: a.userId,
            toUserId: b.userId,
            offer: a.offer,
          })),
          ...(await deliverOffer({
            inventory: inv,
            roomId: params.roomId,
            fromUserId: b.userId,
            toUserId: a.userId,
            offer: b.offer,
          })),
        ]

        trade.status = "completed"
        trade.updatedAt = Date.now()
        for (const p of Object.values(trade.participants)) {
          p.offer = []
          p.draft = []
        }
        await this.deleteTrade(trade)
        return { success: true, message: "Trade complete", trade, transfers }
      })
    } catch (err) {
      console.error("[TradeService] confirm swap failed:", err)
      return { success: false, message: "Could not complete trade" }
    }
  }

  async cancel(params: {
    roomId: string
    userId: string
    tradeId: string
  }): Promise<TradeActionResult> {
    const trade = await this.getTrade(params.roomId, params.tradeId)
    if (!trade) return { success: false, message: "Trade not found" }
    if (!trade.participants[params.userId]) {
      return { success: false, message: "You are not in this trade" }
    }
    await this.refundAndDelete(trade)
    return {
      success: true,
      message: "Trade cancelled",
      trade: { ...trade, status: "cancelled", updatedAt: Date.now() },
    }
  }

  async cancelAllForUser(roomId: string, userId: string): Promise<TradeSession | null> {
    const trade = await this.getTradeForUser(roomId, userId)
    if (!trade) return null
    await this.refundAndDelete(trade)
    return { ...trade, status: "cancelled", updatedAt: Date.now() }
  }

  async cancelAllForRoom(roomId: string): Promise<TradeSession[]> {
    const ids = await this.context.redis.pubClient.sMembers(openTradesKey(roomId))
    const cancelled: TradeSession[] = []
    for (const tradeId of ids) {
      const trade = await this.getTrade(roomId, tradeId)
      if (!trade) {
        await this.context.redis.pubClient.sRem(openTradesKey(roomId), tradeId)
        continue
      }
      await this.refundAndDelete(trade)
      cancelled.push({ ...trade, status: "cancelled", updatedAt: Date.now() })
    }
    return cancelled
  }

  private async persistTrade(trade: TradeSession): Promise<void> {
    await this.context.redis.pubClient.set(
      tradeKey(trade.roomId, trade.tradeId),
      JSON.stringify(trade),
    )
    await this.context.redis.pubClient.set(byUserKey(trade.roomId, trade.fromUserId), trade.tradeId)
    await this.context.redis.pubClient.set(byUserKey(trade.roomId, trade.toUserId), trade.tradeId)
    await this.context.redis.pubClient.sAdd(openTradesKey(trade.roomId), trade.tradeId)
  }

  private async deleteTrade(trade: TradeSession): Promise<void> {
    await this.context.redis.pubClient.del(tradeKey(trade.roomId, trade.tradeId))
    await this.context.redis.pubClient.del(byUserKey(trade.roomId, trade.fromUserId))
    await this.context.redis.pubClient.del(byUserKey(trade.roomId, trade.toUserId))
    await this.context.redis.pubClient.sRem(openTradesKey(trade.roomId), trade.tradeId)
  }

  private async refundAndDelete(trade: TradeSession): Promise<void> {
    for (const p of Object.values(trade.participants)) {
      await refundEscrow({
        inventory: this.inventory,
        roomId: trade.roomId,
        userId: p.userId,
        offer: p.offer,
      })
    }
    await this.deleteTrade(trade)
  }

  private async assertTradingAllowed(roomId: string): Promise<boolean> {
    if (!this.context.gameSessions) return false
    const session = await this.context.gameSessions.getActiveSession(roomId)
    if (!session) return false
    return session.config.allowTrading === true
  }
}
