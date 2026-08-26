import type { AppContext, GiftActionResult, GiftOffer, InventoryItem } from "@repo/types"
import generateId from "../lib/generateId"
import { InventoryService } from "./InventoryService"

import { PLAYER_TRANSFER_TTL_MS } from "@repo/types"

function offerKey(roomId: string, offerId: string): string {
  return `room:${roomId}:gift:${offerId}`
}
function outIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:gifts:out:${userId}`
}
function inIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:gifts:in:${userId}`
}

/**
 * Escrowed player-to-player gifts (ADR 0114).
 * Mutations emit domain events via callers in `operations/inventory`.
 */
export class GiftService {
  constructor(private readonly context: AppContext) {}

  private get inventory(): InventoryService | null {
    return (this.context.inventory as InventoryService | undefined) ?? null
  }

  async getOffer(roomId: string, offerId: string): Promise<GiftOffer | null> {
    const raw = await this.context.redis.pubClient.get(offerKey(roomId, offerId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as GiftOffer
    } catch {
      return null
    }
  }

  async listIncoming(roomId: string, userId: string): Promise<GiftOffer[]> {
    return this.listByIndex(roomId, inIndexKey(roomId, userId))
  }

  async listOutgoing(roomId: string, userId: string): Promise<GiftOffer[]> {
    return this.listByIndex(roomId, outIndexKey(roomId, userId))
  }

  async offerGift(params: {
    roomId: string
    fromUserId: string
    toUserId: string
    itemId: string
    quantity?: number
  }): Promise<GiftActionResult> {
    const { roomId, fromUserId, toUserId, itemId } = params
    const quantity = Math.max(1, Math.floor(params.quantity ?? 1))
    const inv = this.inventory
    if (!inv) return { success: false, message: "Inventory unavailable" }

    if (fromUserId === toUserId) {
      return { success: false, message: "You can't gift an item to yourself" }
    }

    if (!(await this.assertTradingAllowed(roomId))) {
      return { success: false, message: "Trading is not enabled for this session" }
    }

    const outgoing = await this.listOutgoing(roomId, fromUserId)
    if (outgoing.length > 0) {
      return { success: false, message: "You already have a pending gift offer" }
    }

    const existingPair = (await this.listIncoming(roomId, toUserId)).find(
      (o) => o.fromUserId === fromUserId,
    )
    if (existingPair) {
      return { success: false, message: "You already have a pending gift to that listener" }
    }

    try {
      return await inv.withInventoryLocks(roomId, [fromUserId], async () => {
        const raw = await this.context.redis.pubClient.hGet(
          `room:${roomId}:inventory:items:${fromUserId}`,
          itemId,
        )
        if (!raw) return { success: false, message: "Item not found in your inventory" }

        let item: InventoryItem
        try {
          item = JSON.parse(raw) as InventoryItem
        } catch {
          return { success: false, message: "Item data corrupted" }
        }

        const def = await inv.getItemDefinition(roomId, item.definitionId)
        if (!def?.tradeable) {
          return { success: false, message: "That item can't be gifted" }
        }

        const qty = Math.min(quantity, item.quantity)
        if (qty <= 0) return { success: false, message: "Nothing to gift" }

        const removed = await inv.removeItem(roomId, fromUserId, itemId, qty)
        if (!removed) return { success: false, message: "Could not escrow the item" }

        const offer: GiftOffer = {
          offerId: generateId(),
          roomId,
          fromUserId,
          toUserId,
          definitionId: item.definitionId,
          sourcePlugin: item.sourcePlugin,
          originalItemId: itemId,
          quantity: qty,
          metadata: item.metadata,
          itemName: def.name,
          createdAt: Date.now(),
        }

        await this.persistOffer(offer)
        return { success: true, message: "Gift offered", offer }
      })
    } catch (err) {
      console.error("[GiftService] offerGift failed:", err)
      return { success: false, message: "Could not offer gift" }
    }
  }

  async acceptGift(params: {
    roomId: string
    userId: string
    offerId: string
  }): Promise<GiftActionResult & { item?: InventoryItem }> {
    const { roomId, userId, offerId } = params
    const inv = this.inventory
    if (!inv) return { success: false, message: "Inventory unavailable" }

    const offer = await this.getOffer(roomId, offerId)
    if (!offer) return { success: false, message: "Gift offer not found" }
    if (offer.toUserId !== userId) {
      return { success: false, message: "This gift is not for you" }
    }
    if (!(await this.assertTradingAllowed(roomId))) {
      return { success: false, message: "Trading is not enabled for this session" }
    }
    if (Date.now() - offer.createdAt > PLAYER_TRANSFER_TTL_MS) {
      await this.refundAndDelete(offer, "ttl")
      return { success: false, message: "Gift offer expired" }
    }

    try {
      return await inv.withInventoryLocks(roomId, [offer.fromUserId, offer.toUserId], async () => {
        // Re-read under lock
        const current = await this.getOffer(roomId, offerId)
        if (!current) return { success: false, message: "Gift offer not found" }

        const canFit = await inv.canAccommodateItem(
          roomId,
          userId,
          current.definitionId,
          current.quantity,
        )
        if (!canFit) {
          return {
            success: false,
            message: "Free a slot in your inventory or collection to accept this gift",
            offer: current,
          }
        }

        const given = await inv.giveItem(
          roomId,
          userId,
          current.definitionId,
          current.quantity,
          current.metadata,
          "gift",
        )
        if (!given) {
          return {
            success: false,
            message: "Could not add the gift to your inventory",
            offer: current,
          }
        }

        await this.deleteOffer(current)

        if (this.context.systemEvents) {
          await this.context.systemEvents.emit(roomId, "INVENTORY_ITEM_TRANSFERRED", {
            roomId,
            sessionId: (await this.activeSessionId(roomId)) ?? "",
            fromUserId: current.fromUserId,
            toUserId: current.toUserId,
            item: given,
            quantity: current.quantity,
          })
        }

        return { success: true, message: "Gift accepted", offer: current, item: given }
      })
    } catch (err) {
      console.error("[GiftService] acceptGift failed:", err)
      return { success: false, message: "Could not accept gift" }
    }
  }

  async declineGift(params: {
    roomId: string
    userId: string
    offerId: string
  }): Promise<GiftActionResult> {
    const offer = await this.getOffer(params.roomId, params.offerId)
    if (!offer) return { success: false, message: "Gift offer not found" }
    if (offer.toUserId !== params.userId) {
      return { success: false, message: "This gift is not for you" }
    }
    await this.refundAndDelete(offer, "declined")
    return { success: true, message: "Gift declined", offer }
  }

  async cancelGift(params: {
    roomId: string
    userId: string
    offerId: string
  }): Promise<GiftActionResult> {
    const offer = await this.getOffer(params.roomId, params.offerId)
    if (!offer) return { success: false, message: "Gift offer not found" }
    if (offer.fromUserId !== params.userId) {
      return { success: false, message: "Only the sender can cancel this gift" }
    }
    await this.refundAndDelete(offer, "sender")
    return { success: true, message: "Gift cancelled", offer }
  }

  /** Cancel outgoing gifts and decline incoming for a leaving user. */
  async cancelAllForUser(
    roomId: string,
    userId: string,
  ): Promise<{ cancelled: GiftOffer[]; declined: GiftOffer[] }> {
    const outgoing = await this.listOutgoing(roomId, userId)
    const incoming = await this.listIncoming(roomId, userId)
    const cancelled: GiftOffer[] = []
    const declined: GiftOffer[] = []

    for (const offer of outgoing) {
      await this.refundAndDelete(offer, "user_left")
      cancelled.push(offer)
    }
    for (const offer of incoming) {
      await this.refundAndDelete(offer, "user_left")
      declined.push(offer)
    }
    return { cancelled, declined }
  }

  /** Refund every pending gift in the room (session end). */
  async cancelAllForRoom(roomId: string): Promise<GiftOffer[]> {
    const pattern = `room:${roomId}:gift:*`
    const keys = await this.context.redis.pubClient.keys(pattern)
    const cancelled: GiftOffer[] = []
    for (const key of keys) {
      // Skip index keys (gifts:out / gifts:in)
      if (key.includes(":gifts:")) continue
      const raw = await this.context.redis.pubClient.get(key)
      if (!raw) continue
      try {
        const offer = JSON.parse(raw) as GiftOffer
        await this.refundAndDelete(offer, "session_end")
        cancelled.push(offer)
      } catch {
        await this.context.redis.pubClient.del(key)
      }
    }
    return cancelled
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private async listByIndex(roomId: string, indexKey: string): Promise<GiftOffer[]> {
    const ids = await this.context.redis.pubClient.sMembers(indexKey)
    const out: GiftOffer[] = []
    for (const offerId of ids) {
      const offer = await this.getOffer(roomId, offerId)
      if (offer) out.push(offer)
      else await this.context.redis.pubClient.sRem(indexKey, offerId)
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  private async persistOffer(offer: GiftOffer): Promise<void> {
    await this.context.redis.pubClient.set(offerKey(offer.roomId, offer.offerId), JSON.stringify(offer))
    await this.context.redis.pubClient.sAdd(outIndexKey(offer.roomId, offer.fromUserId), offer.offerId)
    await this.context.redis.pubClient.sAdd(inIndexKey(offer.roomId, offer.toUserId), offer.offerId)
  }

  private async deleteOffer(offer: GiftOffer): Promise<void> {
    await this.context.redis.pubClient.del(offerKey(offer.roomId, offer.offerId))
    await this.context.redis.pubClient.sRem(outIndexKey(offer.roomId, offer.fromUserId), offer.offerId)
    await this.context.redis.pubClient.sRem(inIndexKey(offer.roomId, offer.toUserId), offer.offerId)
  }

  private async refundAndDelete(
    offer: GiftOffer,
    _reason: string,
  ): Promise<void> {
    const inv = this.inventory
    if (inv) {
      const refunded = await inv.giveItem(
        offer.roomId,
        offer.fromUserId,
        offer.definitionId,
        offer.quantity,
        offer.metadata,
        "gift",
      )
      if (!refunded) {
        console.error(
          `[GiftService] refund failed for offer ${offer.offerId} to ${offer.fromUserId}`,
        )
      }
    }
    await this.deleteOffer(offer)
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
