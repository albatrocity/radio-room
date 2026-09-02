import type { TradeInvite, TradeSession, UserGameStatePayload } from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import {
  getNotificationLocation,
  raiseNotification,
  reconcileNotifications,
  resolveNotifications,
} from "../actors/notificationsActor"
import { onTradeSessionCompleted, TRADES_GIFTS_TAB } from "../actors/modalsActor"
import { emitTradeInviteRespond } from "./tradeSocketActions"
import { displayNameForUserId } from "./listenerDisplayName"
import { clearTradeCancelledByMe, wasTradeCancelledByMe } from "./tradeCancelledByMe"
import {
  counterpartTradeAlerts,
  watchSnapshotForUser,
  type TradeWatchSnapshot,
} from "./tradeSessionNotifications"
import { locationMatchesTarget } from "./notificationTargets"
import { navigateToTarget } from "./navigateToNotificationTarget"
import {
  tradeAcceptedNotificationId,
  tradeCompleteNotificationId,
  tradeConfirmNotificationId,
  tradeInviteNotificationId,
  tradeLockNotificationId,
} from "./notificationIds"

const TRADE_INVITE_SOURCE = "trade-invite"
const TRADE_SESSION_SOURCE = "trade-session"

function tradeFrame(tradeId: string, otherName: string) {
  return {
    kind: "trade" as const,
    tradeId,
    title: `Trade with ${otherName}`,
  }
}

function isViewingTradeSession(tradeId: string): boolean {
  const location = getNotificationLocation()
  return locationMatchesTarget(location, {
    surface: "gameState",
    tabId: TRADES_GIFTS_TAB,
    frame: { kind: "trade", tradeId, title: "" },
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

export function applyTradeInviteOffered(invite?: TradeInvite): void {
  if (!invite) return
  const me = getCurrentUser()?.userId
  if (!me || invite.toUserId !== me) return

  const fromName = displayNameForUserId(invite.fromUserId)
  const id = tradeInviteNotificationId(invite.inviteId)

  raiseNotification({
    id,
    source: TRADE_INVITE_SOURCE,
    target: { surface: "gameState", tabId: TRADES_GIFTS_TAB },
    clearOn: "resolve",
    toast: {
      title: "Trade invite",
      description: `${fromName} wants to trade with you.`,
      type: "info",
      duration: 12000,
      action: {
        label: "Accept",
        onClick: () => {
          emitTradeInviteRespond({
            inviteId: invite.inviteId,
            fromUserId: invite.fromUserId,
            toUserId: invite.toUserId,
            accept: true,
            onAccepted: ({ tradeId }) => {
              navigateToTarget({
                surface: "gameState",
                tabId: TRADES_GIFTS_TAB,
                frame: tradeFrame(tradeId, fromName),
              })
            },
          })
        },
      },
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

export function notifyTradeInviteExpired(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite) return
  if (invite.fromUserId !== me && invite.toUserId !== me) return

  resolveNotifications([tradeInviteNotificationId(invite.inviteId)])

  const otherId = invite.fromUserId === me ? invite.toUserId : invite.fromUserId
  const otherName = displayNameForUserId(otherId, "the other listener")
  const description =
    invite.fromUserId === me
      ? `Your trade invite to ${otherName} expired.`
      : `Trade invite from ${otherName} expired.`
  raiseNotification({
    id: `trade-invite-expired-${invite.inviteId}`,
    source: TRADE_INVITE_SOURCE,
    target: null,
    clearOn: "resolve",
    toast: {
      title: "Trade invite expired",
      description,
      type: "info",
      duration: 6000,
    },
  })
}

export function dismissTradeInviteToastIfMine(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite || invite.toUserId !== me) return
  resolveNotifications([tradeInviteNotificationId(invite.inviteId)])
}

export function notifyTradeInviteDeclined(invite?: TradeInvite): void {
  const me = getCurrentUser()?.userId
  if (!me || !invite || invite.fromUserId !== me) return

  const toName = displayNameForUserId(invite.toUserId)
  raiseNotification({
    id: `trade-invite-declined-${invite.inviteId}`,
    source: TRADE_INVITE_SOURCE,
    target: null,
    clearOn: "resolve",
    toast: {
      title: "Trade invite declined",
      description: `${toName} declined your trade invite.`,
      type: "info",
      duration: 6000,
    },
  })
}

export function applyTradeInviteAccepted(params: {
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
}): { watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  if (!trade) return {}
  const me = getCurrentUser()?.userId
  if (!me || !trade.participants[me]) return {}

  const snapshot = watchSnapshotForUser(trade, me)
  const watchedTrades = snapshot
    ? { ...params.watchedTrades, [trade.tradeId]: snapshot }
    : params.watchedTrades

  // Resolve the invite notification for the recipient.
  if (trade.toUserId === me) {
    // invite id is not on trade; recipient's invite was resolved via respond.
  }

  if (trade.fromUserId !== me) return { watchedTrades }

  const accepterName = displayNameForUserId(trade.toUserId)
  raiseNotification({
    id: tradeAcceptedNotificationId(trade.tradeId),
    source: TRADE_SESSION_SOURCE,
    target: {
      surface: "gameState",
      tabId: TRADES_GIFTS_TAB,
      frame: tradeFrame(trade.tradeId, accepterName),
    },
    clearOn: "view",
    dismissToastOn: "surface",
    toast: {
      title: "Trade accepted",
      description: `${accepterName} accepted your trade invite.`,
      type: "info",
      duration: 8000,
      action: "open",
    },
  })

  return { watchedTrades }
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

  // Skip alerts while viewing — RAISE also no-ops view-type at target, but
  // we avoid computing counterpart alerts work; center handles toast skip.
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
  const frame = tradeFrame(trade.tradeId, otherName)

  if (alerts.includes("lock")) {
    raiseNotification({
      id: tradeLockNotificationId(trade.tradeId),
      source: TRADE_SESSION_SOURCE,
      target: { surface: "gameState", tabId: TRADES_GIFTS_TAB, frame },
      clearOn: "view",
      dismissToastOn: "target",
      toast: {
        title: "Offer locked",
        description: `${otherName} locked in their trade offer.`,
        type: "info",
        duration: 8000,
        action: "open",
      },
    })
  }

  if (alerts.includes("confirm")) {
    raiseNotification({
      id: tradeConfirmNotificationId(trade.tradeId),
      source: TRADE_SESSION_SOURCE,
      target: { surface: "gameState", tabId: TRADES_GIFTS_TAB, frame },
      clearOn: "view",
      dismissToastOn: "target",
      toast: {
        title: "Trade confirmed",
        description: `${otherName} confirmed the trade. Waiting for you.`,
        type: "info",
        duration: 8000,
        action: "open",
      },
    })
  }

  return { watchedTrades }
}

export function applyTradeCancelled(params: {
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
  reason?: "user" | "session_end" | "user_left" | "trading_disabled"
  cancelledByUserId?: string
}): { watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  if (!trade) return {}

  const watchedTrades = dropWatchedTrade(params.watchedTrades, trade.tradeId)
  resolveNotifications([
    tradeAcceptedNotificationId(trade.tradeId),
    tradeLockNotificationId(trade.tradeId),
    tradeConfirmNotificationId(trade.tradeId),
  ])

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

  const otherId =
    cancelledBy ?? (trade.fromUserId === me ? trade.toUserId : trade.fromUserId)
  const otherName = displayNameForUserId(otherId)

  raiseNotification({
    id: `trade-cancelled-${trade.tradeId}`,
    source: TRADE_SESSION_SOURCE,
    target: null,
    clearOn: "resolve",
    toast: {
      title: "Trade cancelled",
      description: `${otherName} cancelled the trade.`,
      type: "info",
      duration: 6000,
    },
  })

  return { watchedTrades }
}

export function applyTradeCompleted(params: {
  watchedTrades: Record<string, TradeWatchSnapshot>
  trade?: TradeSession
}): { watchedTrades?: Record<string, TradeWatchSnapshot> } {
  const trade = params.trade
  const me = getCurrentUser()?.userId
  if (!me || !trade?.participants?.[me]) return {}

  resolveNotifications([
    tradeAcceptedNotificationId(trade.tradeId),
    tradeLockNotificationId(trade.tradeId),
    tradeConfirmNotificationId(trade.tradeId),
  ])

  const otherId = trade.fromUserId === me ? trade.toUserId : trade.fromUserId
  const otherName = displayNameForUserId(otherId)
  raiseNotification({
    id: tradeCompleteNotificationId(trade.tradeId),
    source: TRADE_SESSION_SOURCE,
    target: null,
    clearOn: "resolve",
    toast: {
      title: "Trade complete",
      description: `You exchanged items with ${otherName}.`,
      type: "success",
      duration: 5000,
    },
  })
  onTradeSessionCompleted(isViewingTradeSession(trade.tradeId))

  return {
    watchedTrades: trade.tradeId
      ? dropWatchedTrade(params.watchedTrades, trade.tradeId)
      : params.watchedTrades,
  }
}

/** Silent re-raise + reconcile from USER_GAME_STATE. */
export function reconcileTradeInvitesFromPayload(
  payload: UserGameStatePayload | null | undefined,
): void {
  const incoming = payload?.pendingTradeInvites?.incoming ?? []
  const keepIds: string[] = []
  for (const invite of incoming) {
    const id = tradeInviteNotificationId(invite.inviteId)
    keepIds.push(id)
    raiseNotification({
      id,
      source: TRADE_INVITE_SOURCE,
      target: { surface: "gameState", tabId: TRADES_GIFTS_TAB },
      clearOn: "resolve",
    })
  }
  reconcileNotifications(TRADE_INVITE_SOURCE, keepIds)
}

export function resolveTradeInvite(inviteId: string): void {
  resolveNotifications([tradeInviteNotificationId(inviteId)])
}
