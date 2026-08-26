import type {
  AppContext,
  InventoryItem,
  ItemDefinition,
  TradeActionResult,
  TradeDraftItem,
  TradeInvite,
  TradeOfferItem,
  TradeParticipantState,
  TradeSession,
} from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS, TRADE_MESSAGE_MAX_LENGTH } from "@repo/types"
import generateId from "../lib/generateId"
import { InventoryService } from "./InventoryService"

function tradeKey(roomId: string, tradeId: string): string {
  return `room:${roomId}:trade:${tradeId}`
}
function byUserKey(roomId: string, userId: string): string {
  return `room:${roomId}:trade:byUser:${userId}`
}
function inviteKey(roomId: string, inviteId: string): string {
  return `room:${roomId}:tradeInvite:${inviteId}`
}
function inviteInIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:tradeInvites:in:${userId}`
}
function inviteOutIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:tradeInvites:out:${userId}`
}

function slotPoolOf(def: ItemDefinition | null | undefined): "inventory" | "collection" {
  return def?.slotPool === "collection" ? "collection" : "inventory"
}

function emptyParticipant(userId: string): TradeParticipantState {
  return {
    userId,
    draft: [],
    offer: [],
    locked: false,
    confirmed: false,
  }
}

type InviteCancelReason = "sender" | "session_end" | "user_left" | "trading_disabled"

/**
 * Two-party trade sessions with escrow on lock (ADR 0114).
 * Trade invites are a separate inbox layer (ADR 0115).
 * Domain events are emitted by `operations/inventory/tradeOps`.
 */
export class TradeService {
  private readonly inviteExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly context: AppContext) {}

  private get inventory(): InventoryService | null {
    return (this.context.inventory as InventoryService | undefined) ?? null
  }

  // ==========================================================================
  // Invites (ADR 0115)
  // ==========================================================================

  async getInvite(roomId: string, inviteId: string): Promise<TradeInvite | null> {
    const raw = await this.context.redis.pubClient.get(inviteKey(roomId, inviteId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as TradeInvite
    } catch {
      return null
    }
  }

  async listIncomingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.listInvitesByIndex(roomId, inviteInIndexKey(roomId, userId))
  }

  async listOutgoingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.listInvitesByIndex(roomId, inviteOutIndexKey(roomId, userId))
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
    await this.persistInvite(invite)
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
    if (this.isInviteExpired(invite)) {
      await this.expireInvite(invite)
      return { success: false, message: "Trade invite expired" }
    }
    if (invite.toUserId !== params.userId) {
      return { success: false, message: "This invite is not for you" }
    }

    if (!params.accept) {
      await this.deleteInvite(invite)
      return { success: true, message: "Trade declined", invite }
    }

    if (!(await this.assertTradingAllowed(params.roomId))) {
      await this.deleteInvite(invite)
      return { success: false, message: "Trading is not enabled for this session" }
    }
    if (await this.getTradeForUser(params.roomId, invite.fromUserId)) {
      await this.deleteInvite(invite)
      return { success: false, message: "The other listener is already in a trade" }
    }
    if (await this.getTradeForUser(params.roomId, invite.toUserId)) {
      await this.deleteInvite(invite)
      return { success: false, message: "You already have an active trade" }
    }

    await this.deleteInvite(invite)

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
    await this.deleteInvite(invite)
    return { success: true, message: "Trade invite cancelled", invite }
  }

  async cancelInvitesForUser(roomId: string, userId: string): Promise<TradeInvite[]> {
    const outgoing = await this.listOutgoingInvites(roomId, userId)
    const incoming = await this.listIncomingInvites(roomId, userId)
    const removed: TradeInvite[] = []
    for (const invite of [...outgoing, ...incoming]) {
      await this.deleteInvite(invite)
      removed.push(invite)
    }
    return removed
  }

  async cancelInvitesForRoom(
    roomId: string,
    reason: InviteCancelReason = "session_end",
  ): Promise<TradeInvite[]> {
    const pattern = `room:${roomId}:tradeInvite:*`
    const keys = await this.context.redis.pubClient.keys(pattern)
    const cancelled: TradeInvite[] = []
    for (const key of keys) {
      const raw = await this.context.redis.pubClient.get(key)
      if (!raw) continue
      try {
        const invite = JSON.parse(raw) as TradeInvite
        await this.deleteInvite(invite)
        cancelled.push(invite)
      } catch {
        await this.context.redis.pubClient.del(key)
      }
    }
    void reason
    return cancelled
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
            await this.refundEscrow(params.roomId, params.userId, escrowed)
            return { success: false, message: "An offered item is no longer available" }
          }
          let item: InventoryItem
          try {
            item = JSON.parse(raw) as InventoryItem
          } catch {
            await this.refundEscrow(params.roomId, params.userId, escrowed)
            return { success: false, message: "Item data corrupted" }
          }
          const def = await inv.getItemDefinition(params.roomId, item.definitionId)
          if (!def?.tradeable) {
            await this.refundEscrow(params.roomId, params.userId, escrowed)
            return { success: false, message: "An offered item can't be traded" }
          }
          const qty = Math.min(row.quantity, item.quantity)
          const removed = await inv.removeItem(params.roomId, params.userId, row.itemId, qty)
          if (!removed) {
            await this.refundEscrow(params.roomId, params.userId, escrowed)
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
      await this.refundEscrow(params.roomId, p.userId, p.offer)
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
          !(await this.canAccommodateOfferList(inv, params.roomId, a.userId, b.offer)) ||
          !(await this.canAccommodateOfferList(inv, params.roomId, b.userId, a.offer))
        ) {
          for (const p of Object.values(trade.participants)) p.confirmed = false
          await this.persistTrade(trade)
          return {
            success: false,
            message: "Not enough inventory/collection space for this trade",
            trade,
          }
        }

        await this.deliverOffer(params.roomId, a.userId, b.userId, a.offer)
        await this.deliverOffer(params.roomId, b.userId, a.userId, b.offer)

        trade.status = "completed"
        trade.updatedAt = Date.now()
        for (const p of Object.values(trade.participants)) {
          p.offer = []
          p.draft = []
        }
        await this.deleteTrade(trade)
        return { success: true, message: "Trade complete", trade }
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
    const pattern = `room:${roomId}:trade:*`
    const keys = await this.context.redis.pubClient.keys(pattern)
    const cancelled: TradeSession[] = []
    for (const key of keys) {
      if (key.includes(":trade:byUser:") || key.includes(":tradeInvite:")) continue
      if (key.includes(":tradeInvites:")) continue
      const raw = await this.context.redis.pubClient.get(key)
      if (!raw) continue
      try {
        const trade = JSON.parse(raw) as TradeSession
        if (trade.status !== "open") continue
        await this.refundAndDelete(trade)
        cancelled.push({ ...trade, status: "cancelled", updatedAt: Date.now() })
      } catch {
        await this.context.redis.pubClient.del(key)
      }
    }
    return cancelled
  }

  // ==========================================================================
  // Internals — invites
  // ==========================================================================

  private isInviteExpired(invite: TradeInvite): boolean {
    return Date.now() - invite.createdAt > PLAYER_TRANSFER_TTL_MS
  }

  private async listInvitesByIndex(roomId: string, indexKey: string): Promise<TradeInvite[]> {
    const ids = await this.context.redis.pubClient.sMembers(indexKey)
    const out: TradeInvite[] = []
    for (const inviteId of ids) {
      const invite = await this.getInvite(roomId, inviteId)
      if (!invite) {
        await this.context.redis.pubClient.sRem(indexKey, inviteId)
        continue
      }
      if (this.isInviteExpired(invite)) {
        await this.expireInvite(invite)
        continue
      }
      out.push(invite)
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  private async persistInvite(invite: TradeInvite): Promise<void> {
    await this.context.redis.pubClient.set(
      inviteKey(invite.roomId, invite.inviteId),
      JSON.stringify(invite),
    )
    await this.context.redis.pubClient.sAdd(
      inviteOutIndexKey(invite.roomId, invite.fromUserId),
      invite.inviteId,
    )
    await this.context.redis.pubClient.sAdd(
      inviteInIndexKey(invite.roomId, invite.toUserId),
      invite.inviteId,
    )
    this.scheduleInviteExpiry(invite)
  }

  private async deleteInvite(invite: TradeInvite): Promise<void> {
    this.clearInviteExpiryTimer(invite.inviteId)
    await this.context.redis.pubClient.del(inviteKey(invite.roomId, invite.inviteId))
    await this.context.redis.pubClient.sRem(
      inviteOutIndexKey(invite.roomId, invite.fromUserId),
      invite.inviteId,
    )
    await this.context.redis.pubClient.sRem(
      inviteInIndexKey(invite.roomId, invite.toUserId),
      invite.inviteId,
    )
  }

  /** Expire invite and emit TRADE_INVITE_EXPIRED via tradeOps caller. Returns true if expired. */
  async expireInviteIfStale(invite: TradeInvite): Promise<boolean> {
    if (!this.isInviteExpired(invite)) return false
    await this.expireInvite(invite)
    return true
  }

  async expireInvite(invite: TradeInvite): Promise<void> {
    await this.deleteInvite(invite)
    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(invite.roomId, "TRADE_INVITE_EXPIRED", {
        roomId: invite.roomId,
        invite,
      })
    }
  }

  private scheduleInviteExpiry(invite: TradeInvite): void {
    this.clearInviteExpiryTimer(invite.inviteId)
    const remaining = invite.createdAt + PLAYER_TRANSFER_TTL_MS - Date.now()
    const delay = Math.max(0, remaining)
    const timer = setTimeout(() => {
      void this.expireInvite(invite)
    }, delay)
    this.inviteExpiryTimers.set(invite.inviteId, timer)
  }

  private clearInviteExpiryTimer(inviteId: string): void {
    const timer = this.inviteExpiryTimers.get(inviteId)
    if (timer) {
      clearTimeout(timer)
      this.inviteExpiryTimers.delete(inviteId)
    }
  }

  // ==========================================================================
  // Internals — sessions
  // ==========================================================================

  private async deliverOffer(
    roomId: string,
    fromUserId: string,
    toUserId: string,
    offer: TradeOfferItem[],
  ): Promise<void> {
    const inv = this.inventory
    if (!inv) return
    for (const e of offer) {
      const given = await inv.giveItem(
        roomId,
        toUserId,
        e.definitionId,
        e.quantity,
        e.metadata,
        "trade",
      )
      if (!given) {
        console.error("[TradeService] deliverOffer failed", e.definitionId, toUserId)
        continue
      }
      if (this.context.systemEvents) {
        await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_TRANSFERRED", {
          roomId,
          sessionId: (await this.activeSessionId(roomId)) ?? "",
          fromUserId,
          toUserId,
          item: given,
          quantity: e.quantity,
        })
      }
    }
  }

  private async refundEscrow(
    roomId: string,
    userId: string,
    offer: TradeOfferItem[],
  ): Promise<void> {
    const inv = this.inventory
    if (!inv) return
    for (const e of offer) {
      if (!e.definitionId) continue
      const refunded = await inv.giveItem(
        roomId,
        userId,
        e.definitionId,
        e.quantity,
        e.metadata,
        "trade",
      )
      if (!refunded) {
        console.error(`[TradeService] refund failed ${userId} ${e.definitionId}`)
      }
    }
  }

  private async persistTrade(trade: TradeSession): Promise<void> {
    await this.context.redis.pubClient.set(
      tradeKey(trade.roomId, trade.tradeId),
      JSON.stringify(trade),
    )
    await this.context.redis.pubClient.set(byUserKey(trade.roomId, trade.fromUserId), trade.tradeId)
    await this.context.redis.pubClient.set(byUserKey(trade.roomId, trade.toUserId), trade.tradeId)
  }

  private async deleteTrade(trade: TradeSession): Promise<void> {
    await this.context.redis.pubClient.del(tradeKey(trade.roomId, trade.tradeId))
    await this.context.redis.pubClient.del(byUserKey(trade.roomId, trade.fromUserId))
    await this.context.redis.pubClient.del(byUserKey(trade.roomId, trade.toUserId))
  }

  private async refundAndDelete(trade: TradeSession): Promise<void> {
    for (const p of Object.values(trade.participants)) {
      await this.refundEscrow(trade.roomId, p.userId, p.offer)
    }
    await this.deleteTrade(trade)
  }

  private async canAccommodateOfferList(
    inv: InventoryService,
    roomId: string,
    userId: string,
    incoming: TradeOfferItem[],
  ): Promise<boolean> {
    const bag = await inv.getInventory(roomId, userId)
    const defs = await inv.getAllItemDefinitions(roomId)
    const byId = new Map(defs.map((d) => [d.id, d]))

    let invUsed = 0
    let colUsed = 0
    for (const item of bag.items) {
      if (slotPoolOf(byId.get(item.definitionId)) === "collection") colUsed += 1
      else invUsed += 1
    }

    const stacks = bag.items.map((i) => ({ ...i }))

    for (const e of incoming) {
      const def = byId.get(e.definitionId) ?? (await inv.getItemDefinition(roomId, e.definitionId))
      if (!def) return false
      let remaining = e.quantity
      if (def.stackable) {
        for (const s of stacks) {
          if (s.definitionId !== e.definitionId) continue
          const room = def.maxStack - s.quantity
          if (room <= 0) continue
          const add = Math.min(room, remaining)
          s.quantity += add
          remaining -= add
          if (remaining <= 0) break
        }
      }
      while (remaining > 0) {
        const pool = slotPoolOf(def)
        if (pool === "collection") {
          if (colUsed >= bag.maxCollectionSlots) return false
          colUsed += 1
        } else {
          if (invUsed >= bag.maxSlots) return false
          invUsed += 1
        }
        const take = def.stackable ? Math.min(remaining, def.maxStack) : 1
        stacks.push({
          itemId: `sim-${stacks.length}`,
          definitionId: e.definitionId,
          sourcePlugin: e.sourcePlugin,
          quantity: take,
          acquiredAt: 0,
        })
        remaining -= take
      }
    }
    return true
  }

  private async assertTradingAllowed(roomId: string): Promise<boolean> {
    if (!this.context.gameSessions) return false
    const session = await this.context.gameSessions.getActiveSession(roomId)
    if (!session) return false
    return session.config.allowTrading === true
  }

  private async activeSessionId(roomId: string): Promise<string | null> {
    if (!this.context.gameSessions) return null
    const session = await this.context.gameSessions.getActiveSession(roomId)
    return session?.id ?? null
  }
}
