import type { AppContext, HandlerConnections, TradeSession } from "@repo/types"
import { emitToUserSocket } from "../lib/emitToUserSocket"
import {
  acceptGift,
  cancelGift,
  declineGift,
  offerGift,
} from "../operations/inventory/giftOps"
import {
  tradeCancel,
  tradeConfirm,
  tradeInvite,
  tradeLock,
  tradeRespond,
  tradeSetMessage,
  tradeSetOffer,
  tradeTyping,
  tradeUnlock,
} from "../operations/inventory/tradeOps"

export class GiftTradeHandlers {
  constructor(private readonly context: AppContext) {}

  private emitGiftResult(
    { socket }: HandlerConnections,
    data: { success: boolean; message?: string; offerId?: string },
  ) {
    socket.emit("event", { type: "GIFT_ACTION_RESULT", data })
  }

  private emitTradeResult(
    { socket }: HandlerConnections,
    data: {
      success: boolean
      message?: string
      tradeId?: string
      trade?: TradeSession
    },
  ) {
    socket.emit("event", { type: "TRADE_ACTION_RESULT", data })
  }

  offerGift = async (
    connections: HandlerConnections,
    data: { itemId?: string; toUserId?: string; quantity?: number },
  ) => {
    if (!data?.itemId || !data?.toUserId) {
      this.emitGiftResult(connections, { success: false, message: "Missing itemId or toUserId" })
      return
    }
    const { socket } = connections
    const result = await offerGift({
      roomId: socket.data.roomId,
      fromUserId: socket.data.userId,
      toUserId: data.toUserId,
      itemId: data.itemId,
      quantity: data.quantity,
      context: this.context,
    })
    this.emitGiftResult(connections, {
      success: result.success,
      message: result.message,
      offerId: result.offer?.offerId,
    })
  }

  acceptGift = async (connections: HandlerConnections, data: { offerId?: string }) => {
    if (!data?.offerId) {
      this.emitGiftResult(connections, { success: false, message: "Missing offerId" })
      return
    }
    const { socket } = connections
    const result = await acceptGift({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      offerId: data.offerId,
      context: this.context,
    })
    this.emitGiftResult(connections, {
      success: result.success,
      message: result.message,
      offerId: result.offer?.offerId,
    })
  }

  declineGift = async (connections: HandlerConnections, data: { offerId?: string }) => {
    if (!data?.offerId) {
      this.emitGiftResult(connections, { success: false, message: "Missing offerId" })
      return
    }
    const { socket } = connections
    const result = await declineGift({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      offerId: data.offerId,
      context: this.context,
    })
    this.emitGiftResult(connections, {
      success: result.success,
      message: result.message,
      offerId: result.offer?.offerId,
    })
  }

  cancelGift = async (connections: HandlerConnections, data: { offerId?: string }) => {
    if (!data?.offerId) {
      this.emitGiftResult(connections, { success: false, message: "Missing offerId" })
      return
    }
    const { socket } = connections
    const result = await cancelGift({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      offerId: data.offerId,
      context: this.context,
    })
    this.emitGiftResult(connections, {
      success: result.success,
      message: result.message,
      offerId: result.offer?.offerId,
    })
  }

  tradeInvite = async (connections: HandlerConnections, data: { toUserId?: string }) => {
    if (!data?.toUserId) {
      this.emitTradeResult(connections, { success: false, message: "Missing toUserId" })
      return
    }
    const { socket } = connections
    const result = await tradeInvite({
      roomId: socket.data.roomId,
      fromUserId: socket.data.userId,
      toUserId: data.toUserId,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.invite?.inviteId ?? result.trade?.tradeId,
    })
  }

  tradeRespond = async (
    connections: HandlerConnections,
    data: { tradeId?: string; accept?: boolean },
  ) => {
    if (!data?.tradeId || data.accept == null) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId or accept" })
      return
    }
    const { socket } = connections
    const result = await tradeRespond({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      inviteId: data.tradeId,
      accept: data.accept,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
      trade: result.trade,
    })
  }

  tradeSetOffer = async (
    connections: HandlerConnections,
    data: { tradeId?: string; items?: { itemId: string; quantity: number }[] },
  ) => {
    if (!data?.tradeId || !Array.isArray(data.items)) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId or items" })
      return
    }
    const { socket } = connections
    const result = await tradeSetOffer({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      items: data.items,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }

  tradeSetMessage = async (
    connections: HandlerConnections,
    data: { tradeId?: string; message?: string },
  ) => {
    if (!data?.tradeId || typeof data.message !== "string") {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId or message" })
      return
    }
    const { socket } = connections
    const result = await tradeSetMessage({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      message: data.message,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }

  tradeTyping = async (
    connections: HandlerConnections,
    data: { tradeId?: string; typing?: boolean },
  ) => {
    if (!data?.tradeId || typeof data.typing !== "boolean") return
    const { socket, io } = connections
    const result = await tradeTyping({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      context: this.context,
    })
    if (!result.success || !result.counterpartUserId) return
    await emitToUserSocket({
      io,
      context: this.context,
      roomId: socket.data.roomId,
      userId: result.counterpartUserId,
      type: "TRADE_TYPING",
      data: {
        roomId: socket.data.roomId,
        tradeId: data.tradeId,
        userId: socket.data.userId,
        typing: data.typing,
      },
    })
  }

  tradeLock = async (connections: HandlerConnections, data: { tradeId?: string }) => {
    if (!data?.tradeId) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId" })
      return
    }
    const { socket } = connections
    const result = await tradeLock({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }

  tradeUnlock = async (connections: HandlerConnections, data: { tradeId?: string }) => {
    if (!data?.tradeId) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId" })
      return
    }
    const { socket } = connections
    const result = await tradeUnlock({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }

  tradeConfirm = async (connections: HandlerConnections, data: { tradeId?: string }) => {
    if (!data?.tradeId) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId" })
      return
    }
    const { socket } = connections
    const result = await tradeConfirm({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }

  tradeCancel = async (connections: HandlerConnections, data: { tradeId?: string }) => {
    if (!data?.tradeId) {
      this.emitTradeResult(connections, { success: false, message: "Missing tradeId" })
      return
    }
    const { socket } = connections
    const result = await tradeCancel({
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      tradeId: data.tradeId,
      context: this.context,
    })
    this.emitTradeResult(connections, {
      success: result.success,
      message: result.message,
      tradeId: result.trade?.tradeId,
    })
  }
}

export function createGiftTradeHandlers(context: AppContext) {
  return new GiftTradeHandlers(context)
}
