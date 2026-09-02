import type { TradeInvite, TradeSession } from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import { openGameStateOnTab, onTradeSessionCompleted, TRADES_GIFTS_TAB } from "../actors/modalsActor"
import {
  markTradesGiftsSessionUnseen,
  markTradesGiftsTabUnseen,
} from "../actors/gameStateTradesGiftsAttentionActor"
import { emitTradeInviteRespond } from "./tradeSocketActions"
import { isViewingGameStateTab } from "./isViewingGameStateTab"
import { displayNameForUserId } from "./listenerDisplayName"
import { dismissTradeInviteToast, tradeInviteToastId } from "./tradeInviteToast"
import { clearTradeCancelledByMe, wasTradeCancelledByMe } from "./tradeCancelledByMe"
import {
  counterpartTradeAlerts,
  dismissTradeSessionToasts,
  isViewingTradeSession,
  tradeAcceptedToastId,
  tradeCompleteToastId,
  tradeConfirmToastId,
  tradeLockToastId,
  watchSnapshotForUser,
  type TradeWatchSnapshot,
} from "./tradeSessionNotifications"
import { toaster } from "../components/ui/toaster"

function openTradeSession(tradeId: string, otherName: string): void {
  openGameStateOnTab({
    tabId: TRADES_GIFTS_TAB,
    frame: {
      kind: "trade",
      tradeId,
      title: `Trade with ${otherName}`,
    },
  })
}

export function dropWatchedTrade(
  watched: Record<string, TradeWatchSnapshot>,
  tradeId: string,
): Record<string, TradeWatchSnapshot> {
  if (!(tradeId in watched)) return watched
  const next = { ...watched }
  delete next[tradeId]
  return next
}

export function applyTradeInviteOffered(params: {
  toastedInviteIds: string[]
  invite?: TradeInvite
}): { toastedInviteIds?: string[] } {
  const invite = params.invite
  if (!invite) return {}
  const me = getCurrentUser()?.userId
  if (!me || invite.toUserId !== me) return {}
  if (params.toastedInviteIds.includes(invite.inviteId)) return {}

  const fromName = displayNameForUserId(invite.fromUserId)

  if (!isViewingGameStateTab(TRADES_GIFTS_TAB)) {
    markTradesGiftsTabUnseen()
    toaster.create({
      id: tradeInviteToastId(invite.inviteId),
      title: "Trade invite",
      description: `${fromName} wants to trade with you.`,
      type: "info",
      duration: 12000,
      closable: true,
      action: {
        label: "Accept",
        onClick: () => {
          emitTradeInviteRespond({
            inviteId: invite.inviteId,
            fromUserId: invite.fromUserId,
            toUserId: invite.toUserId,
            accept: true,
            onAccepted: ({ tradeId }) => {
              openGameStateOnTab({
                tabId: TRADES_GIFTS_TAB,
                frame: {
                  kind: "trade",
                  tradeId,
                  title: `Trade with ${fromName}`,
                },
              })
            },
          })
        },
      },
      meta: {
        secondaryAction: {
          label: "Decline",
          onClick: () => {
            emitTradeInviteRespond({
              inviteId: invite.inviteId,
              fromUserId: invite.fromUserId,
              toUserId: invite.toUserId,
              accept: false,
            })
          },
        },
      },
    })
  }

  return { toastedInviteIds: [...params.toastedInviteIds, invite.inviteId] }
}

export function notifyTradeInviteExpired(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite) return
  if (invite.fromUserId !== me && invite.toUserId !== me) return

  dismissTradeInviteToast(invite.inviteId)
  const otherId = invite.fromUserId === me ? invite.toUserId : invite.fromUserId
  const otherName = displayNameForUserId(otherId, "the other listener")
  const description =
    invite.fromUserId === me
      ? `Your trade invite to ${otherName} expired.`
      : `Trade invite from ${otherName} expired.`
  toaster.create({
    title: "Trade invite expired",
    description,
    type: "info",
    duration: 6000,
    closable: true,
  })
}

export function dismissTradeInviteToastIfMine(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite || invite.toUserId !== me) return
  dismissTradeInviteToast(invite.inviteId)
}

export function notifyTradeInviteDeclined(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite || invite.fromUserId !== me) return

  const toName = displayNameForUserId(invite.toUserId)
  toaster.create({
    title: "Trade invite declined",
    description: `${toName} declined your trade invite.`,
    type: "info",
    duration: 6000,
    closable: true,
  })
}

export function applyTradeInviteAccepted(params: {
  toastedTradeAcceptedIds: string[]
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
}): { toastedTradeAcceptedIds?: string[]; watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  if (!trade) return {}
  const me = getCurrentUser()?.userId
  if (!me || !trade.participants[me]) return {}

  const snapshot = watchSnapshotForUser(trade, me)
  const watchedTrades = snapshot
    ? { ...params.watchedTrades, [trade.tradeId]: snapshot }
    : params.watchedTrades

  if (trade.fromUserId !== me) return { watchedTrades }
  if (params.toastedTradeAcceptedIds.includes(trade.tradeId)) return { watchedTrades }

  if (!isViewingTradeSession(trade.tradeId)) {
    const accepterName = displayNameForUserId(trade.toUserId)
    markTradesGiftsSessionUnseen()
    toaster.create({
      id: tradeAcceptedToastId(trade.tradeId),
      title: "Trade accepted",
      description: `${accepterName} accepted your trade invite.`,
      type: "info",
      duration: 8000,
      closable: true,
      action: {
        label: "Open",
        onClick: () => openTradeSession(trade.tradeId, accepterName),
      },
    })
  }

  return {
    toastedTradeAcceptedIds: [...params.toastedTradeAcceptedIds, trade.tradeId],
    watchedTrades,
  }
}

export function applyTradeUpdated(params: {
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
}): { watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  if (!trade) return {}
  const me = getCurrentUser()?.userId
  if (!me) return {}
  const snapshot = watchSnapshotForUser(trade, me)
  if (!snapshot) return {}

  const mine = trade.participants[me]
  const prev = params.watchedTrades[trade.tradeId] ?? {
    otherLocked: false,
    otherConfirmed: false,
  }
  const watchedTrades = { ...params.watchedTrades, [trade.tradeId]: snapshot }

  if (isViewingTradeSession(trade.tradeId)) {
    return { watchedTrades }
  }

  const alerts = counterpartTradeAlerts(prev, {
    ...snapshot,
    iConfirmed: Boolean(mine?.confirmed),
  })
  if (alerts.length === 0) return { watchedTrades }

  const otherId = trade.fromUserId === me ? trade.toUserId : trade.fromUserId
  const otherName = displayNameForUserId(otherId)

  if (alerts.includes("lock")) {
    markTradesGiftsSessionUnseen()
    toaster.create({
      id: tradeLockToastId(trade.tradeId),
      title: "Offer locked",
      description: `${otherName} locked in their trade offer.`,
      type: "info",
      duration: 8000,
      closable: true,
      action: {
        label: "Open",
        onClick: () => openTradeSession(trade.tradeId, otherName),
      },
    })
  }

  if (alerts.includes("confirm")) {
    markTradesGiftsSessionUnseen()
    toaster.create({
      id: tradeConfirmToastId(trade.tradeId),
      title: "Trade confirmed",
      description: `${otherName} confirmed the trade. Waiting for you.`,
      type: "info",
      duration: 8000,
      closable: true,
      action: {
        label: "Open",
        onClick: () => openTradeSession(trade.tradeId, otherName),
      },
    })
  }

  return { watchedTrades }
}

export function applyTradeCancelled(params: {
  toastedTradeCancelledIds: string[]
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
  reason?: "user" | "session_end" | "user_left" | "trading_disabled"
  cancelledByUserId?: string
}): { toastedTradeCancelledIds?: string[]; watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  if (!trade) return {}

  const watchedTrades = dropWatchedTrade(params.watchedTrades, trade.tradeId)
  const reason = params.reason ?? "user"
  if (reason !== "user") return { watchedTrades }

  const me = getCurrentUser()?.userId
  if (!me || !trade.participants[me]) return { watchedTrades }

  if (wasTradeCancelledByMe(trade.tradeId)) {
    clearTradeCancelledByMe(trade.tradeId)
    return { watchedTrades }
  }

  const cancelledBy = params.cancelledByUserId
  if (cancelledBy === me) return { watchedTrades }

  if (params.toastedTradeCancelledIds.includes(trade.tradeId)) return { watchedTrades }

  const otherId =
    cancelledBy ?? (trade.fromUserId === me ? trade.toUserId : trade.fromUserId)
  const otherName = displayNameForUserId(otherId)

  toaster.create({
    title: "Trade cancelled",
    description: `${otherName} cancelled the trade.`,
    type: "info",
    duration: 6000,
    closable: true,
  })

  return {
    toastedTradeCancelledIds: [...params.toastedTradeCancelledIds, trade.tradeId],
    watchedTrades,
  }
}

export function applyTradeCompleted(params: {
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
}): { watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  const me = getCurrentUser()?.userId
  if (!me || !trade?.participants?.[me]) return {}

  if (trade.tradeId) dismissTradeSessionToasts(trade.tradeId)
  toaster.dismiss(`trade-invite-${trade.tradeId}`)

  const otherId = trade.fromUserId === me ? trade.toUserId : trade.fromUserId
  const otherName = displayNameForUserId(otherId)
  toaster.create({
    id: tradeCompleteToastId(trade.tradeId),
    title: "Trade complete",
    description: `You exchanged items with ${otherName}.`,
    type: "success",
    duration: 5000,
    closable: true,
  })
  onTradeSessionCompleted(isViewingTradeSession(trade.tradeId))

  return {
    watchedTrades: trade.tradeId
      ? dropWatchedTrade(params.watchedTrades, trade.tradeId)
      : params.watchedTrades,
  }
}
