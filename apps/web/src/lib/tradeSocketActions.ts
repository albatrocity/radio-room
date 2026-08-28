import type { TradeSession } from "@repo/types"
import { activateTrade } from "../actors/tradeActor"
import { refreshUserGameState } from "../actors/userGameStateActor"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { dismissTradeInviteToast } from "./tradeInviteToast"
import { clearTradesGiftsTabAttentionIfEmpty } from "./tradesGiftsAttention"
import { toaster } from "../components/ui/toaster"

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
  dismissTradeInviteToast(inviteId)

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
      clearTradesGiftsTabAttentionIfEmpty({ excludeInviteId: inviteId })
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
  dismissTradeInviteToast(inviteId)
  emitToSocket("TRADE_CANCEL", { tradeId: inviteId })
}
