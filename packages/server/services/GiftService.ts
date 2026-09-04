import type { AppContext, GiftActionResult, GiftOffer, InventoryItem } from "@repo/types"
import { resolveSlotPool, slotPoolFullMessage } from "@repo/types"
import {
  failIfDuplicateGiftPair,
  failIfOutgoingGift,
  failIfSelfTransfer,
  failIfTradingDisabled,
} from "@repo/game-logic"
import generateId from "../lib/generateId"
import { hydrateIndexedJson } from "../lib/hydrateIndexedJson"
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
function allOffersKey(roomId: string): string {
  return `room:${roomId}:gifts:all`
}

/**
 * Escrowed player-to-player gifts (ADR 0114).
 * Mutations emit domain events via callers in `operations/inventory`.
 */
export class GiftService {
  private readonly offerExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

    const self = failIfSelfTransfer(fromUserId, toUserId, "gift")
    if (self) return self

    const trading = failIfTradingDisabled(await this.assertTradingAllowed(roomId))
    if (trading) return trading

    const outgoing = await this.listOutgoing(roomId, fromUserId)
    const outgoingBusy = failIfOutgoingGift(outgoing.length > 0)
    if (outgoingBusy) return outgoingBusy

    const existingPair = (await this.listIncoming(roomId, toUserId)).find(
      (o) => o.fromUserId === fromUserId,
    )
    const pairBusy = failIfDuplicateGiftPair(Boolean(existingPair))
    if (pairBusy) return pairBusy

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
    const trading = failIfTradingDisabled(await this.assertTradingAllowed(roomId))
    if (trading) return trading

    try {
      return await inv.withInventoryLocks(roomId, [offer.fromUserId, offer.toUserId], async () => {
        // Re-read under lock
        const current = await this.getOffer(roomId, offerId)
        if (!current) return { success: false, message: "Gift offer not found" }

        if (Date.now() - current.createdAt > PLAYER_TRANSFER_TTL_MS) {
          await this.refundAndDelete(current, "ttl")
          return { success: false, message: "Gift offer expired", offer: current, expired: true }
        }

        const canFit = await inv.canAccommodateItem(
          roomId,
          userId,
          current.definitionId,
          current.quantity,
        )
        if (!canFit) {
          const giftDef = await inv.getItemDefinition(roomId, current.definitionId)
          const pool = resolveSlotPool(giftDef)
          return {
            success: false,
            message: slotPoolFullMessage(pool, "free a slot to accept this gift."),
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
          const giftDef = await inv.getItemDefinition(roomId, current.definitionId)
          const pool = resolveSlotPool(giftDef)
          return {
            success: false,
            message: slotPoolFullMessage(pool, "could not add the gift."),
            offer: current,
          }
        }

        await this.deleteOffer(current)

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
    const ids = await this.context.redis.pubClient.sMembers(allOffersKey(roomId))
    const cancelled: GiftOffer[] = []
    for (const offerId of ids) {
      const offer = await this.getOffer(roomId, offerId)
      if (!offer) {
        await this.context.redis.pubClient.sRem(allOffersKey(roomId), offerId)
        continue
      }
      await this.refundAndDelete(offer, "session_end")
      cancelled.push(offer)
    }
    return cancelled
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private async listByIndex(roomId: string, indexKey: string): Promise<GiftOffer[]> {
    const offers = await hydrateIndexedJson<GiftOffer>({
      redis: this.context.redis,
      indexKey,
      allSetKey: allOffersKey(roomId),
      recordKey: (id) => offerKey(roomId, id),
      onRecord: async (offer) => {
        if (Date.now() - offer.createdAt > PLAYER_TRANSFER_TTL_MS) {
          const expired = await this.expireIfStale(offer)
          if (expired) await this.notifyOfferExpired(offer)
          return "drop"
        }
        return "keep"
      },
    })
    return offers.sort((a, b) => a.createdAt - b.createdAt)
  }

  private async persistOffer(offer: GiftOffer): Promise<void> {
    await this.context.redis.pubClient.set(offerKey(offer.roomId, offer.offerId), JSON.stringify(offer))
    await this.context.redis.pubClient.sAdd(outIndexKey(offer.roomId, offer.fromUserId), offer.offerId)
    await this.context.redis.pubClient.sAdd(inIndexKey(offer.roomId, offer.toUserId), offer.offerId)
    await this.context.redis.pubClient.sAdd(allOffersKey(offer.roomId), offer.offerId)
    this.scheduleOfferExpiry(offer)
  }

  private async deleteOffer(offer: GiftOffer): Promise<void> {
    this.clearOfferExpiryTimer(offer.offerId)
    await this.context.redis.pubClient.del(offerKey(offer.roomId, offer.offerId))
    await this.context.redis.pubClient.sRem(outIndexKey(offer.roomId, offer.fromUserId), offer.offerId)
    await this.context.redis.pubClient.sRem(inIndexKey(offer.roomId, offer.toUserId), offer.offerId)
    await this.context.redis.pubClient.sRem(allOffersKey(offer.roomId), offer.offerId)
  }

  private async notifyOfferExpired(offer: GiftOffer): Promise<void> {
    const { emitGiftCancelled } = await import("../operations/inventory/giftOps")
    await emitGiftCancelled({ context: this.context, offer, reason: "ttl" })
  }

  private scheduleOfferExpiry(offer: GiftOffer): void {
    this.clearOfferExpiryTimer(offer.offerId)
    const remaining = offer.createdAt + PLAYER_TRANSFER_TTL_MS - Date.now()
    const delay = Math.max(0, remaining)
    const timer = setTimeout(() => {
      void this.expireIfStale(offer).then((expired) => {
        if (expired) return this.notifyOfferExpired(offer)
      })
    }, delay)
    this.offerExpiryTimers.set(offer.offerId, timer)
  }

  private clearOfferExpiryTimer(offerId: string): void {
    const timer = this.offerExpiryTimers.get(offerId)
    if (timer) {
      clearTimeout(timer)
      this.offerExpiryTimers.delete(offerId)
    }
  }

  /** Refund escrow if the Redis row is still present. Returns true when a row was removed. */
  private async refundAndDelete(offer: GiftOffer, _reason: string): Promise<boolean> {
    const current = await this.getOffer(offer.roomId, offer.offerId)
    if (!current) return false
    const inv = this.inventory
    if (inv) {
      const refunded = await inv.giveItem(
        current.roomId,
        current.fromUserId,
        current.definitionId,
        current.quantity,
        current.metadata,
        "gift",
      )
      if (!refunded) {
        console.error(
          `[GiftService] refund failed for offer ${current.offerId} to ${current.fromUserId}`,
        )
      }
    }
    await this.deleteOffer(current)
    return true
  }

  private async expireIfStale(offer: GiftOffer): Promise<boolean> {
    const inv = this.inventory
    const run = async () => {
      const current = await this.getOffer(offer.roomId, offer.offerId)
      if (!current) return false
      if (Date.now() - current.createdAt <= PLAYER_TRANSFER_TTL_MS) return false
      return this.refundAndDelete(current, "ttl")
    }
    if (!inv) return run()
    return inv.withInventoryLocks(offer.roomId, [offer.fromUserId, offer.toUserId], run)
  }

  private async assertTradingAllowed(roomId: string): Promise<boolean> {
    if (!this.context.gameSessions) return false
    const session = await this.context.gameSessions.getActiveSession(roomId)
    if (!session) return false
    return session.config.allowTrading === true
  }
}
