import type { TradeSession } from "@repo/types"
import { activateTrade } from "../actors/tradeActor"
import { refreshUserGameState } from "../actors/userGameStateActor"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { resolveNotifications } from "../actors/notificationsActor"
import { tradeInviteNotificationId } from "./notificationIds"
import { toaster } from "../components/ui/toaster"

function resolveTradeInvite(inviteId: string): void {
  resolveNotifications([tradeInviteNotificationId(inviteId)])
}

type TradeActionResultData = {
  success?: boolean
  message?: string
  tradeId?: string
  trade?: TradeSession
}

function tradeIdFromResult(data: TradeActionResultData): string | undefined {
  return data.tradeId ?? data.trade?.tradeId
}

function matchesInviteTrade(
  trade: TradeSession,
  invite: { fromUserId: string; toUserId: string },
): boolean {
  return (
    trade.status === "open" &&
    trade.fromUserId === invite.fromUserId &&
    trade.toUserId === invite.toUserId
  )
}

/** One in-flight TRADE_RESPOND per invite (toast ActionTrigger used to double-fire). */
const inFlightInviteRespond = new Set<string>()

export function emitTradeInviteRespond(params: {
  inviteId: string
  fromUserId: string
  toUserId: string
  accept: boolean
  onAccepted?: (info: { tradeId: string; trade?: TradeSession }) => void
  onDone?: (success: boolean, message?: string) => void
  errorTitle?: string
}): void {
  const { inviteId, fromUserId, toUserId, accept, onAccepted, onDone, errorTitle } = params
  if (inFlightInviteRespond.has(inviteId)) return
  inFlightInviteRespond.add(inviteId)
  resolveTradeInvite(inviteId)

  const subscriptionId = `trade-invite-respond-${inviteId}-${Date.now()}`
  let settled = false
  let navigated = false

  const notifyAccepted = (tradeId: string, trade?: TradeSession) => {
    if (trade) activateTrade(trade)
    refreshUserGameState()
    if (!navigated) {
      navigated = true
      onAccepted?.({ tradeId, trade })
    } else if (trade) {
      activateTrade(trade)
      refreshUserGameState()
    }
  }

  const finish = (success: boolean, message?: string) => {
    if (settled) return
    settled = true
    inFlightInviteRespond.delete(inviteId)
    unsubscribeById(subscriptionId)
    onDone?.(success, message)
    if (!success && message) {
      toaster.create({
        title: errorTitle ?? "Trade",
        description: message,
        type: "error",
        duration: 6000,
        closable: true,
      })
      return
    }
    if (success) {
      resolveTradeInvite(inviteId)
    }
  }

  subscribeById(subscriptionId, {
    send: (event: { type: string; data?: TradeActionResultData & { trade?: TradeSession } }) => {
      if (event.type === "TRADE_ACTION_RESULT" && event.data) {
        const data = event.data
        if (data.success !== true) {
          finish(false, data.message)
          return
        }
        if (!accept) {
          finish(true, data.message)
          return
        }
        const trade = data.trade
        const tradeId = tradeIdFromResult(data)
        if (trade) {
          notifyAccepted(trade.tradeId, trade)
          finish(true, data.message)
          return
        }
        if (tradeId) {
          notifyAccepted(tradeId)
          finish(true, data.message)
        }
        return
      }

      if (event.type === "TRADE_UPDATED" && accept && event.data?.trade) {
        const trade = event.data.trade
        if (matchesInviteTrade(trade, { fromUserId, toUserId })) {
          notifyAccepted(trade.tradeId, trade)
          finish(true)
        }
      }
    },
    eventTypes: ["TRADE_ACTION_RESULT", "TRADE_UPDATED"],
  })

  emitToSocket("TRADE_RESPOND", { tradeId: inviteId, accept })
}

export function emitTradeInviteCancel(inviteId: string): void {
  resolveTradeInvite(inviteId)
  emitToSocket("TRADE_CANCEL", { tradeId: inviteId })
}

export function emitTradeInvite(toUserId: string): void {
  emitToSocket("TRADE_INVITE", { toUserId })
}

export function emitTradeLock(tradeId: string): void {
  emitToSocket("TRADE_LOCK", { tradeId })
}

export function emitTradeUnlock(tradeId: string): void {
  emitToSocket("TRADE_UNLOCK", { tradeId })
}

export function emitTradeConfirm(tradeId: string): void {
  emitToSocket("TRADE_CONFIRM", { tradeId })
}

export function emitTradeSetOffer(
  tradeId: string,
  items: { itemId: string; quantity: number }[],
): void {
  emitToSocket("TRADE_SET_OFFER", { tradeId, items })
}

export function emitTradeSetMessage(tradeId: string, message: string): void {
  emitToSocket("TRADE_SET_MESSAGE", { tradeId, message })
}

export function emitTradeTyping(tradeId: string, typing: boolean): void {
  emitToSocket("TRADE_TYPING", { tradeId, typing })
}

export { emitTradeCancel } from "./tradeCancelledByMe"
