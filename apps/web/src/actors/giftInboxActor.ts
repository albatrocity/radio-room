/**
 * Gift inbox toasts + accept/decline when Game State is closed (ADR 0114).
 * Trades/Gifts tab lists pending gifts and trade invites from USER_GAME_STATE.
 */

import { createActor, setup, assign } from "xstate"
import type { GiftOffer, TradeInvite, TradeSession } from "@repo/types"
import { subscribeById, unsubscribeById } from "./socketActor"
import { getCurrentUser } from "./authActor"
import { getUserById } from "./usersActor"
import { openGameStateOnTab, TRADES_GIFTS_TAB } from "./modalsActor"
import { markTradesGiftsTabUnseen } from "./gameStateTradesGiftsAttentionActor"
import { dismissTradeInviteToast, tradeInviteToastId } from "../lib/tradeInviteToast"
import { clearTradeCancelledByMe, wasTradeCancelledByMe } from "../lib/tradeCancelledByMe"
import { emitTradeInviteRespond } from "../lib/tradeSocketActions"
import { toaster } from "../components/ui/toaster"

export { dismissTradeInviteToast, tradeInviteToastId } from "../lib/tradeInviteToast"

type Context = {
  subscriptionId: string | null
  toastedOfferIds: string[]
  toastedInviteIds: string[]
  toastedTradeAcceptedIds: string[]
  toastedTradeCancelledIds: string[]
}

type Event =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "RESET" }
  | {
      type: "GIFT_OFFERED"
      data?: { offer?: GiftOffer }
    }
  | { type: "GIFT_COMPLETED"; data?: { offer?: GiftOffer } }
  | { type: "GIFT_DECLINED"; data?: { offer?: GiftOffer } }
  | { type: "GIFT_CANCELLED"; data?: { offer?: GiftOffer } }
  | {
      type: "TRADE_INVITE_OFFERED"
      data?: { invite?: TradeInvite }
    }
  | {
      type: "TRADE_INVITE_EXPIRED"
      data?: { invite?: TradeInvite }
    }
  | {
      type: "TRADE_INVITE_DECLINED"
      data?: { invite?: TradeInvite }
    }
  | {
      type: "TRADE_INVITE_CANCELLED"
      data?: { invite?: TradeInvite }
    }
  | {
      type: "TRADE_INVITE_ACCEPTED"
      data?: { trade?: TradeSession }
    }
  | {
      type: "TRADE_CANCELLED"
      data?: {
        trade?: TradeSession
        reason?: "user" | "session_end" | "user_left" | "trading_disabled"
        cancelledByUserId?: string
      }
    }
  | { type: "TRADE_COMPLETED"; data?: { trade?: { tradeId: string; participants: Record<string, unknown> } } }

let subCounter = 0

const giftInboxMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `giftInbox-${self.id}-${++subCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as Event),
        eventTypes: [
          "GIFT_OFFERED",
          "GIFT_COMPLETED",
          "GIFT_DECLINED",
          "GIFT_CANCELLED",
          "TRADE_INVITE_OFFERED",
          "TRADE_INVITE_EXPIRED",
          "TRADE_INVITE_DECLINED",
          "TRADE_INVITE_CANCELLED",
          "TRADE_INVITE_ACCEPTED",
          "TRADE_CANCELLED",
          "TRADE_COMPLETED",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) unsubscribeById(context.subscriptionId)
    },
    reset: assign({
      subscriptionId: () => null,
      toastedOfferIds: () => [],
      toastedInviteIds: () => [],
      toastedTradeAcceptedIds: () => [],
      toastedTradeCancelledIds: () => [],
    }),
    notifyGiftOffered: assign(({ context, event }) => {
      if (event.type !== "GIFT_OFFERED") return {}
      const offer = event.data?.offer
      if (!offer) return {}
      const me = getCurrentUser()?.userId
      if (!me || offer.toUserId !== me) return {}
      if (context.toastedOfferIds.includes(offer.offerId)) return {}

      const fromName =
        getUserById(offer.fromUserId)?.username?.trim() || "Someone"
      const label = offer.itemName ?? "an item"
      markTradesGiftsTabUnseen()
      toaster.create({
        title: "Gift received",
        description: `${fromName} offered you ${label}. Open Trades/Gifts to accept or decline.`,
        type: "info",
        duration: 8000,
        closable: true,
        action: {
          label: "Open",
          onClick: () => openGameStateOnTab({ tabId: TRADES_GIFTS_TAB }),
        },
      })

      return { toastedOfferIds: [...context.toastedOfferIds, offer.offerId] }
    }),
    notifyGiftDeclined: ({ event }) => {
      if (event.type !== "GIFT_DECLINED") return
      const offer = event.data?.offer
      const me = getCurrentUser()?.userId
      if (!me || !offer || offer.fromUserId !== me) return

      const toName = getUserById(offer.toUserId)?.username?.trim() || "Someone"
      const label = offer.itemName ?? "your gift"
      toaster.create({
        title: "Gift declined",
        description: `${toName} declined ${label}.`,
        type: "info",
        duration: 6000,
        closable: true,
      })
    },
    notifyTradeInvite: assign(({ context, event }) => {
      if (event.type !== "TRADE_INVITE_OFFERED") return {}
      const invite = event.data?.invite
      if (!invite) return {}
      const me = getCurrentUser()?.userId
      if (!me || invite.toUserId !== me) return {}
      if (context.toastedInviteIds.includes(invite.inviteId)) return {}

      const fromName =
        getUserById(invite.fromUserId)?.username?.trim() || "Someone"

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

      return { toastedInviteIds: [...context.toastedInviteIds, invite.inviteId] }
    }),
    notifyTradeInviteExpired: ({ event }) => {
      if (event.type !== "TRADE_INVITE_EXPIRED") return
      const invite = event.data?.invite
      const me = getCurrentUser()?.userId
      if (!me || !invite) return
      if (invite.fromUserId !== me && invite.toUserId !== me) return

      dismissTradeInviteToast(invite.inviteId)
      const otherId = invite.fromUserId === me ? invite.toUserId : invite.fromUserId
      const otherName = getUserById(otherId)?.username?.trim() || "the other listener"
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
    },
    dismissTradeInviteToastIfMine: ({ event }) => {
      if (event.type !== "TRADE_INVITE_DECLINED" && event.type !== "TRADE_INVITE_CANCELLED") {
        return
      }
      const invite = event.data?.invite
      const me = getCurrentUser()?.userId
      if (!me || !invite || invite.toUserId !== me) return
      dismissTradeInviteToast(invite.inviteId)
    },
    notifyTradeInviteDeclined: ({ event }) => {
      if (event.type !== "TRADE_INVITE_DECLINED") return
      const invite = event.data?.invite
      const me = getCurrentUser()?.userId
      if (!me || !invite || invite.fromUserId !== me) return

      const toName = getUserById(invite.toUserId)?.username?.trim() || "Someone"
      toaster.create({
        title: "Trade invite declined",
        description: `${toName} declined your trade invite.`,
        type: "info",
        duration: 6000,
        closable: true,
      })
    },
    notifyTradeInviteAccepted: assign(({ context, event }) => {
      if (event.type !== "TRADE_INVITE_ACCEPTED") return {}
      const trade = event.data?.trade
      if (!trade) return {}
      const me = getCurrentUser()?.userId
      if (!me || trade.fromUserId !== me) return {}
      if (context.toastedTradeAcceptedIds.includes(trade.tradeId)) return {}

      const accepterName = getUserById(trade.toUserId)?.username?.trim() || "Someone"
      markTradesGiftsTabUnseen()
      toaster.create({
        title: "Trade accepted",
        description: `${accepterName} accepted your trade invite.`,
        type: "info",
        duration: 8000,
        closable: true,
        action: {
          label: "Open",
          onClick: () =>
            openGameStateOnTab({
              tabId: TRADES_GIFTS_TAB,
              frame: {
                kind: "trade",
                tradeId: trade.tradeId,
                title: `Trade with ${accepterName}`,
              },
            }),
        },
      })

      return { toastedTradeAcceptedIds: [...context.toastedTradeAcceptedIds, trade.tradeId] }
    }),
    notifyTradeCancelled: assign(({ context, event }) => {
      if (event.type !== "TRADE_CANCELLED") return {}
      const trade = event.data?.trade
      if (!trade) return {}

      const reason = event.data?.reason ?? "user"
      if (reason !== "user") return {}

      const me = getCurrentUser()?.userId
      if (!me || !trade.participants[me]) return {}

      if (wasTradeCancelledByMe(trade.tradeId)) {
        clearTradeCancelledByMe(trade.tradeId)
        return {}
      }

      const cancelledBy = event.data?.cancelledByUserId
      if (cancelledBy === me) return {}

      if (context.toastedTradeCancelledIds.includes(trade.tradeId)) return {}

      const otherId =
        cancelledBy ??
        (trade.fromUserId === me ? trade.toUserId : trade.fromUserId)
      const otherName = getUserById(otherId)?.username?.trim() || "Someone"

      toaster.create({
        title: "Trade cancelled",
        description: `${otherName} cancelled the trade.`,
        type: "info",
        duration: 6000,
        closable: true,
      })

      return {
        toastedTradeCancelledIds: [...context.toastedTradeCancelledIds, trade.tradeId],
      }
    }),
    notifyTradeCompleted: ({ event }) => {
      if (event.type !== "TRADE_COMPLETED") return
      const trade = event.data?.trade
      const me = getCurrentUser()?.userId
      if (!me || !trade?.participants?.[me]) return

      toaster.dismiss(`trade-invite-${trade.tradeId}`)
      toaster.create({
        title: "Trade complete",
        description: "Your items have been exchanged.",
        type: "success",
        duration: 5000,
        closable: true,
      })
      openGameStateOnTab({ tabId: TRADES_GIFTS_TAB })
    },
  },
}).createMachine({
  id: "giftInbox",
  initial: "idle",
  context: {
    subscriptionId: null,
    toastedOfferIds: [],
    toastedInviteIds: [],
    toastedTradeAcceptedIds: [],
    toastedTradeCancelledIds: [],
  },
  states: {
    idle: {
      on: { ACTIVATE: "active" },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: { target: "idle", actions: ["reset"] },
        RESET: { actions: ["reset"] },
        GIFT_OFFERED: { actions: ["notifyGiftOffered"] },
        GIFT_DECLINED: { actions: ["notifyGiftDeclined"] },
        TRADE_INVITE_OFFERED: { actions: ["notifyTradeInvite"] },
        TRADE_INVITE_EXPIRED: { actions: ["notifyTradeInviteExpired"] },
        TRADE_INVITE_DECLINED: {
          actions: ["dismissTradeInviteToastIfMine", "notifyTradeInviteDeclined"],
        },
        TRADE_INVITE_CANCELLED: { actions: ["dismissTradeInviteToastIfMine"] },
        TRADE_INVITE_ACCEPTED: { actions: ["notifyTradeInviteAccepted"] },
        TRADE_CANCELLED: { actions: ["notifyTradeCancelled"] },
        TRADE_COMPLETED: { actions: ["notifyTradeCompleted"] },
      },
    },
  },
})

export const giftInboxActor = createActor(giftInboxMachine).start()
