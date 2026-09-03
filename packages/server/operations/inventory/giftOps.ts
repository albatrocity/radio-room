import type { AppContext, GiftActionResult, GiftOffer, InventoryItem } from "@repo/types"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayNameWithMaskMeta, emitInventoryTransferred } from "./transferEvents"

export type GiftOpResult = GiftActionResult & { item?: InventoryItem }

export async function emitGiftCancelled(params: {
  context: AppContext
  offer: GiftOffer
  reason: "sender" | "session_end" | "user_left" | "ttl"
}): Promise<void> {
  if (!params.context.systemEvents) return
  await params.context.systemEvents.emit(params.offer.roomId, "GIFT_CANCELLED", {
    roomId: params.offer.roomId,
    offer: params.offer,
    reason: params.reason,
  })
}

export async function offerGift(params: {
  roomId: string
  fromUserId: string
  toUserId: string
  itemId: string
  quantity?: number
  context: AppContext
}): Promise<GiftOpResult> {
  const gifts = params.context.gifts
  if (!gifts) return { success: false, message: "Gift service unavailable" }

  const result = (await gifts.offerGift({
    roomId: params.roomId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    itemId: params.itemId,
    quantity: params.quantity,
  })) as GiftOpResult

  if (result.success && result.offer && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "GIFT_OFFERED", {
      roomId: params.roomId,
      offer: result.offer,
    })
  }
  return result
}

export async function acceptGift(params: {
  roomId: string
  userId: string
  offerId: string
  context: AppContext
}): Promise<GiftOpResult> {
  const gifts = params.context.gifts
  if (!gifts) return { success: false, message: "Gift service unavailable" }

  const result = (await gifts.acceptGift({
    roomId: params.roomId,
    userId: params.userId,
    offerId: params.offerId,
  })) as GiftOpResult

  if (result.expired && result.offer) {
    await emitGiftCancelled({
      context: params.context,
      offer: result.offer,
      reason: "ttl",
    })
    return result
  }

  if (result.success && result.offer && result.item && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "GIFT_COMPLETED", {
      roomId: params.roomId,
      offer: result.offer,
      item: result.item,
    })
    await emitInventoryTransferred({
      context: params.context,
      roomId: params.roomId,
      fromUserId: result.offer.fromUserId,
      toUserId: result.offer.toUserId,
      item: result.item,
      quantity: result.offer.quantity,
    })

    const [fromAttr, toAttr] = await Promise.all([
      displayNameWithMaskMeta(params.context, params.roomId, result.offer.fromUserId),
      displayNameWithMaskMeta(params.context, params.roomId, result.offer.toUserId),
    ])
    const label = result.offer.itemName ?? "an item"
    const masked = [fromAttr, toAttr].filter((a) => a.masked)
    await postSystemChatMessage({
      context: params.context,
      roomId: params.roomId,
      content: `${fromAttr.label} gifted ${label} to ${toAttr.label}.`,
      meta:
        masked.length > 0
          ? {
              maskedUserIds: masked.map((a) => a.userId),
              maskedLabel: masked[0]!.label,
            }
          : undefined,
    })
  }

  return result
}

export async function declineGift(params: {
  roomId: string
  userId: string
  offerId: string
  context: AppContext
}): Promise<GiftOpResult> {
  const gifts = params.context.gifts
  if (!gifts) return { success: false, message: "Gift service unavailable" }

  const result = (await gifts.declineGift({
    roomId: params.roomId,
    userId: params.userId,
    offerId: params.offerId,
  })) as GiftOpResult

  if (result.success && result.offer && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "GIFT_DECLINED", {
      roomId: params.roomId,
      offer: result.offer,
    })
  }
  return result
}

export async function cancelGift(params: {
  roomId: string
  userId: string
  offerId: string
  context: AppContext
}): Promise<GiftOpResult> {
  const gifts = params.context.gifts
  if (!gifts) return { success: false, message: "Gift service unavailable" }

  const result = (await gifts.cancelGift({
    roomId: params.roomId,
    userId: params.userId,
    offerId: params.offerId,
  })) as GiftOpResult

  if (result.success && result.offer && params.context.systemEvents) {
    await emitGiftCancelled({
      context: params.context,
      offer: result.offer,
      reason: "sender",
    })
  }
  return result
}

export async function cancelGiftsForUserLeave(params: {
  roomId: string
  userId: string
  context: AppContext
}): Promise<void> {
  const gifts = params.context.gifts
  if (!gifts) return

  const { cancelled, declined } = (await gifts.cancelAllForUser(
    params.roomId,
    params.userId,
  )) as { cancelled: GiftOffer[]; declined: GiftOffer[] }

  if (!params.context.systemEvents) return
  for (const offer of [...cancelled, ...declined]) {
    await emitGiftCancelled({
      context: params.context,
      offer,
      reason: "user_left",
    })
  }
}

export async function cancelGiftsForSessionEnd(params: {
  roomId: string
  context: AppContext
}): Promise<void> {
  const gifts = params.context.gifts
  if (!gifts) return

  const cancelled = (await gifts.cancelAllForRoom(params.roomId)) as GiftOffer[]
  for (const offer of cancelled) {
    await emitGiftCancelled({
      context: params.context,
      offer,
      reason: "session_end",
    })
  }
}
