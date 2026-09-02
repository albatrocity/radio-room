/**
 * Gift inbox toasts + accept/decline when Game State is closed (ADR 0114).
 * Trades/Gifts tab lists pending gifts and trade invites from USER_GAME_STATE.
 * Toast implementations live in `giftInboxNotifications` / `tradeInboxNotifications`.
 */

import { createActor, setup, assign } from "xstate"
import type { GiftOffer, TradeInvite, TradeSession } from "@repo/types"
import { subscribeById, unsubscribeById } from "./socketActor"
import { getCurrentUser } from "./authActor"
import { applyGiftOffered, notifyGiftDeclined as toastGiftDeclined } from "../lib/giftInboxNotifications"
import {
  applyTradeCancelled,
  applyTradeCompleted,
  applyTradeInviteAccepted,
  applyTradeInviteOffered,
  applyTradeUpdated,
  dismissTradeInviteToastIfMine as dismissInviteToastIfRecipient,
  notifyTradeInviteDeclined as toastTradeInviteDeclined,
  notifyTradeInviteExpired as toastTradeInviteExpired,
} from "../lib/tradeInboxNotifications"
import {
  watchSnapshotForUser,
  type TradeWatchSnapshot,
} from "../lib/tradeSessionNotifications"
import { getUserGameStatePayload } from "./userGameStateActor"

export { dismissTradeInviteToast, tradeInviteToastId } from "../lib/tradeInviteToast"

type Context = {
  subscriptionId: string | null
  toastedOfferIds: string[]
  toastedInviteIds: string[]
  toastedTradeAcceptedIds: string[]
  toastedTradeCancelledIds: string[]
  watchedTrades: Record<string, TradeWatchSnapshot>
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
  | { type: "TRADE_COMPLETED"; data?: { trade?: TradeSession } }
  | { type: "TRADE_UPDATED"; data?: { trade?: TradeSession } }

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
        send: (event) => {
          if (self.getSnapshot().status !== "active") return
          self.send(event as Event)
        },
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
          "TRADE_UPDATED",
          "TRADE_CANCELLED",
          "TRADE_COMPLETED",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) unsubscribeById(context.subscriptionId)
    },
    seedWatchedTrades: assign(() => {
      const me = getCurrentUser()?.userId
      const trade = getUserGameStatePayload()?.activeTrade
      if (!me || !trade) return { watchedTrades: {} }
      const snapshot = watchSnapshotForUser(trade, me)
      if (!snapshot) return { watchedTrades: {} }
      return { watchedTrades: { [trade.tradeId]: snapshot } }
    }),
    reset: assign({
      subscriptionId: () => null,
      toastedOfferIds: () => [],
      toastedInviteIds: () => [],
      toastedTradeAcceptedIds: () => [],
      toastedTradeCancelledIds: () => [],
      watchedTrades: () => ({}),
    }),
    notifyGiftOffered: assign(({ context, event }) => {
      if (event.type !== "GIFT_OFFERED") return {}
      return applyGiftOffered({
        toastedOfferIds: context.toastedOfferIds,
        offer: event.data?.offer,
      })
    }),
    notifyGiftDeclined: ({ event }) => {
      if (event.type !== "GIFT_DECLINED") return
      toastGiftDeclined(event.data?.offer)
    },
    notifyTradeInvite: assign(({ context, event }) => {
      if (event.type !== "TRADE_INVITE_OFFERED") return {}
      return applyTradeInviteOffered({
        toastedInviteIds: context.toastedInviteIds,
        invite: event.data?.invite,
      })
    }),
    notifyTradeInviteExpired: ({ event }) => {
      if (event.type !== "TRADE_INVITE_EXPIRED") return
      toastTradeInviteExpired(event.data?.invite)
    },
    dismissTradeInviteToastIfMine: ({ event }) => {
      if (event.type !== "TRADE_INVITE_DECLINED" && event.type !== "TRADE_INVITE_CANCELLED") {
        return
      }
      dismissInviteToastIfRecipient(event.data?.invite)
    },
    notifyTradeInviteDeclined: ({ event }) => {
      if (event.type !== "TRADE_INVITE_DECLINED") return
      toastTradeInviteDeclined(event.data?.invite)
    },
    notifyTradeInviteAccepted: assign(({ context, event }) => {
      if (event.type !== "TRADE_INVITE_ACCEPTED") return {}
      return applyTradeInviteAccepted({
        toastedTradeAcceptedIds: context.toastedTradeAcceptedIds,
        watchedTrades: context.watchedTrades,
        trade: event.data?.trade,
      })
    }),
    notifyTradeUpdated: assign(({ context, event }) => {
      if (event.type !== "TRADE_UPDATED") return {}
      return applyTradeUpdated({
        watchedTrades: context.watchedTrades,
        trade: event.data?.trade,
      })
    }),
    notifyTradeCancelled: assign(({ context, event }) => {
      if (event.type !== "TRADE_CANCELLED") return {}
      return applyTradeCancelled({
        toastedTradeCancelledIds: context.toastedTradeCancelledIds,
        watchedTrades: context.watchedTrades,
        trade: event.data?.trade,
        reason: event.data?.reason,
        cancelledByUserId: event.data?.cancelledByUserId,
      })
    }),
    notifyTradeCompleted: assign(({ context, event }) => {
      if (event.type !== "TRADE_COMPLETED") return {}
      return applyTradeCompleted({
        watchedTrades: context.watchedTrades,
        trade: event.data?.trade,
      })
    }),
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
    watchedTrades: {},
  },
  states: {
    idle: {
      on: { ACTIVATE: "active" },
    },
    active: {
      entry: ["subscribe", "seedWatchedTrades"],
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
        TRADE_UPDATED: { actions: ["notifyTradeUpdated"] },
        TRADE_CANCELLED: { actions: ["notifyTradeCancelled"] },
        TRADE_COMPLETED: { actions: ["notifyTradeCompleted"] },
      },
    },
  },
})

export const giftInboxActor = createActor(giftInboxMachine).start()
