import type { GiftOffer, UserGameStatePayload } from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import {
  raiseNotification,
  reconcileNotifications,
  resolveNotifications,
} from "../actors/notificationsActor"
import { TRADES_GIFTS_TAB } from "../constants/gameStateTabs"
import { giftOfferNotificationId } from "./notificationIds"
import { displayNameForUserId } from "./listenerDisplayName"

const GIFT_SOURCE = "gift"

export function raiseGiftOffered(offer?: GiftOffer): void {
  if (!offer) return
  const me = getCurrentUser()?.userId
  if (!me || offer.toUserId !== me) return

  const fromName = displayNameForUserId(offer.fromUserId)
  const label = offer.itemName ?? "an item"
  raiseNotification({
    id: giftOfferNotificationId(offer.offerId),
    source: GIFT_SOURCE,
    target: { surface: "gameState", tabId: TRADES_GIFTS_TAB },
    clearOn: "resolve",
    toast: {
      title: "Gift received",
      description: `${fromName} offered you ${label}. Open Trades/Gifts to accept or decline.`,
      type: "info",
      duration: 8000,
      action: "open",
    },
  })
}

export function notifyGiftDeclined(offer?: GiftOffer): void {
  const me = getCurrentUser()?.userId
  if (!me || !offer || offer.fromUserId !== me) return

  const toName = displayNameForUserId(offer.toUserId)
  const label = offer.itemName ?? "your gift"
  raiseNotification({
    id: `gift-declined-${offer.offerId}`,
    source: GIFT_SOURCE,
    target: null,
    clearOn: "resolve",
    toast: {
      title: "Gift declined",
      description: `${toName} declined ${label}.`,
      type: "info",
      duration: 6000,
    },
  })
}

/** Silent re-raise + reconcile from USER_GAME_STATE (server is source of truth). */
export function reconcileGiftsFromPayload(payload: UserGameStatePayload | null | undefined): void {
  const incoming = payload?.pendingGifts?.incoming ?? []
  const keepIds: string[] = []
  for (const offer of incoming) {
    const id = giftOfferNotificationId(offer.offerId)
    keepIds.push(id)
    raiseNotification({
      id,
      source: GIFT_SOURCE,
      target: { surface: "gameState", tabId: TRADES_GIFTS_TAB },
      clearOn: "resolve",
      // Silent: no toast on reconnect / refetch.
    })
  }
  reconcileNotifications(GIFT_SOURCE, keepIds)
}

export function resolveGiftOffer(offerId: string): void {
  resolveNotifications([giftOfferNotificationId(offerId)])
}
