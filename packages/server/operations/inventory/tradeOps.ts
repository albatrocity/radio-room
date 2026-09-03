import type { AppContext, TradeActionResult, TradeInvite, TradeSession } from "@repo/types"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayNameWithMaskMeta, emitInventoryTransferred } from "./transferEvents"

async function emitUpdated(context: AppContext, roomId: string, trade: TradeSession) {
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "TRADE_UPDATED", { roomId, trade })
  }
}

export async function emitTradeInviteExpired(params: {
  context: AppContext
  invite: TradeInvite
}): Promise<void> {
  if (!params.context.systemEvents) return
  await params.context.systemEvents.emit(params.invite.roomId, "TRADE_INVITE_EXPIRED", {
    roomId: params.invite.roomId,
    invite: params.invite,
  })
}

export async function tradeInvite(params: {
  roomId: string
  fromUserId: string
  toUserId: string
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.invite({
    roomId: params.roomId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
  })) as TradeActionResult
  if (result.success && result.invite && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_OFFERED", {
      roomId: params.roomId,
      invite: result.invite,
    })
  }
  return result
}

export async function tradeRespond(params: {
  roomId: string
  userId: string
  inviteId: string
  accept: boolean
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.respondInvite({
    roomId: params.roomId,
    userId: params.userId,
    inviteId: params.inviteId,
    accept: params.accept,
  })) as TradeActionResult

  if (result.invite && !params.accept && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_DECLINED", {
      roomId: params.roomId,
      invite: result.invite,
    })
    return result
  }

  if (result.success && result.trade) {
    if (params.accept && params.context.systemEvents) {
      await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_ACCEPTED", {
        roomId: params.roomId,
        trade: result.trade,
      })
    }
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

export async function tradeCancelInvite(params: {
  roomId: string
  userId: string
  inviteId: string
  context: AppContext
  reason?: "sender" | "session_end" | "user_left" | "trading_disabled"
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.cancelInvite({
    roomId: params.roomId,
    userId: params.userId,
    inviteId: params.inviteId,
  })) as TradeActionResult
  if (result.success && result.invite && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_CANCELLED", {
      roomId: params.roomId,
      invite: result.invite,
      reason: params.reason ?? "sender",
    })
  }
  return result
}

export async function tradeSetOffer(params: {
  roomId: string
  userId: string
  tradeId: string
  items: { itemId: string; quantity: number }[]
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.setOffer(params)) as TradeActionResult
  if (result.success && result.trade) {
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

export async function tradeSetMessage(params: {
  roomId: string
  userId: string
  tradeId: string
  message: string
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.setMessage(params)) as TradeActionResult
  if (result.success && result.trade) {
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

/** Validate typing membership. Handler delivers TRADE_TYPING (ADR 0120). */
export async function tradeTyping(params: {
  roomId: string
  userId: string
  tradeId: string
  context: AppContext
}): Promise<{ success: boolean; message?: string; counterpartUserId?: string }> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const trade = (await trades.getTrade(params.roomId, params.tradeId)) as TradeSession | null
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  if (!trade.participants[params.userId]) {
    return { success: false, message: "You are not in this trade" }
  }
  const counterpartUserId =
    trade.fromUserId === params.userId ? trade.toUserId : trade.fromUserId
  return { success: true, counterpartUserId }
}

export async function tradeLock(params: {
  roomId: string
  userId: string
  tradeId: string
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.lock(params)) as TradeActionResult
  if (result.success && result.trade) {
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

export async function tradeUnlock(params: {
  roomId: string
  userId: string
  tradeId: string
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.unlock(params)) as TradeActionResult
  if (result.success && result.trade) {
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

export async function tradeConfirm(params: {
  roomId: string
  userId: string
  tradeId: string
  context: AppContext
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }
  const result = (await trades.confirm(params)) as TradeActionResult

  if (result.success && result.trade?.status === "completed") {
    if (params.context.systemEvents) {
      await params.context.systemEvents.emit(params.roomId, "TRADE_COMPLETED", {
        roomId: params.roomId,
        trade: result.trade,
      })
    }
    for (const transfer of result.transfers ?? []) {
      await emitInventoryTransferred({
        context: params.context,
        roomId: params.roomId,
        fromUserId: transfer.fromUserId,
        toUserId: transfer.toUserId,
        item: transfer.item,
        quantity: transfer.quantity,
      })
    }
    const [aAttr, bAttr] = await Promise.all([
      displayNameWithMaskMeta(params.context, params.roomId, result.trade.fromUserId),
      displayNameWithMaskMeta(params.context, params.roomId, result.trade.toUserId),
    ])
    const masked = [aAttr, bAttr].filter((x) => x.masked)
    await postSystemChatMessage({
      context: params.context,
      roomId: params.roomId,
      content: `${aAttr.label} and ${bAttr.label} completed a trade.`,
      meta:
        masked.length > 0
          ? {
              maskedUserIds: masked.map((x) => x.userId),
              maskedLabel: masked[0]!.label,
            }
          : undefined,
    })
    return result
  }

  if (result.success && result.trade) {
    await emitUpdated(params.context, params.roomId, result.trade)
  }
  return result
}

export async function tradeCancel(params: {
  roomId: string
  userId: string
  tradeId: string
  context: AppContext
  reason?: "user" | "session_end" | "user_left" | "trading_disabled"
}): Promise<TradeActionResult> {
  const trades = params.context.trades
  if (!trades) return { success: false, message: "Trade service unavailable" }

  const invite = await trades.getInvite(params.roomId, params.tradeId)
  if (invite) {
    if (invite.fromUserId === params.userId) {
      return tradeCancelInvite({
        roomId: params.roomId,
        userId: params.userId,
        inviteId: params.tradeId,
        context: params.context,
        reason: params.reason === "trading_disabled" ? "trading_disabled" : "sender",
      })
    }
    if (invite.toUserId === params.userId) {
      const declined = (await trades.respondInvite({
        roomId: params.roomId,
        userId: params.userId,
        inviteId: params.tradeId,
        accept: false,
      })) as TradeActionResult
      if (declined.invite && params.context.systemEvents) {
        await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_DECLINED", {
          roomId: params.roomId,
          invite: declined.invite,
        })
      }
      return declined
    }
    return { success: false, message: "You are not part of this invite" }
  }

  const result = (await trades.cancel(params)) as TradeActionResult
  if (result.success && result.trade && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_CANCELLED", {
      roomId: params.roomId,
      trade: result.trade,
      reason: params.reason ?? "user",
      cancelledByUserId: params.userId,
    })
  }
  return result
}

export async function cancelTradesForUserLeave(params: {
  roomId: string
  userId: string
  context: AppContext
}): Promise<void> {
  const trades = params.context.trades
  if (!trades) return

  const invites = await trades.cancelInvitesForUser(params.roomId, params.userId)
  if (params.context.systemEvents) {
    for (const invite of invites) {
      const reason = invite.fromUserId === params.userId ? "sender" : "user_left"
      await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_CANCELLED", {
        roomId: params.roomId,
        invite,
        reason: reason === "sender" ? "sender" : "user_left",
      })
    }
  }

  const trade = (await trades.cancelAllForUser(params.roomId, params.userId)) as TradeSession | null
  if (trade && params.context.systemEvents) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_CANCELLED", {
      roomId: params.roomId,
      trade,
      reason: "user_left",
      cancelledByUserId: params.userId,
    })
  }
}

export async function cancelTradeInvitesForRoom(params: {
  roomId: string
  context: AppContext
  reason?: "session_end" | "trading_disabled"
}): Promise<TradeInvite[]> {
  const trades = params.context.trades
  if (!trades) return []
  const cancelled = await trades.cancelInvitesForRoom(params.roomId, params.reason ?? "session_end")
  if (params.context.systemEvents) {
    for (const invite of cancelled) {
      await params.context.systemEvents.emit(params.roomId, "TRADE_INVITE_CANCELLED", {
        roomId: params.roomId,
        invite,
        reason: params.reason ?? "session_end",
      })
    }
  }
  return cancelled
}

export async function cancelTradesForSessionEnd(params: {
  roomId: string
  context: AppContext
  reason?: "session_end" | "trading_disabled"
}): Promise<void> {
  await cancelTradeInvitesForRoom({
    roomId: params.roomId,
    context: params.context,
    reason: params.reason ?? "session_end",
  })

  const trades = params.context.trades
  if (!trades) return
  const cancelled = (await trades.cancelAllForRoom(params.roomId)) as TradeSession[]
  if (!params.context.systemEvents) return
  for (const trade of cancelled) {
    await params.context.systemEvents.emit(params.roomId, "TRADE_CANCELLED", {
      roomId: params.roomId,
      trade,
      reason: params.reason ?? "session_end",
    })
  }
}
