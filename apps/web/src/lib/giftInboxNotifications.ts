import type { GiftOffer } from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import { openGameStateOnTab, TRADES_GIFTS_TAB } from "../actors/modalsActor"
import { markTradesGiftsTabUnseen } from "../actors/gameStateTradesGiftsAttentionActor"
import { isViewingGameStateTab } from "./isViewingGameStateTab"
import { displayNameForUserId } from "./listenerDisplayName"
import { toaster } from "../components/ui/toaster"

export function applyGiftOffered(params: {
  toastedOfferIds: string[]
  offer?: GiftOffer
}): { toastedOfferIds?: string[] } {
  const offer = params.offer
  if (!offer) return {}
  const me = getCurrentUser()?.userId
  if (!me || offer.toUserId !== me) return {}
  if (params.toastedOfferIds.includes(offer.offerId)) return {}

  const fromName = displayNameForUserId(offer.fromUserId)
  const label = offer.itemName ?? "an item"
  if (!isViewingGameStateTab(TRADES_GIFTS_TAB)) {
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
  }

  return { toastedOfferIds: [...params.toastedOfferIds, offer.offerId] }
}

export function notifyGiftDeclined(offer?: GiftOffer): void {
  const me = getCurrentUser()?.userId
  if (!me || !offer || offer.fromUserId !== me) return

  const toName = displayNameForUserId(offer.toUserId)
  const label = offer.itemName ?? "your gift"
  toaster.create({
    title: "Gift declined",
    description: `${toName} declined ${label}.`,
    type: "info",
    duration: 6000,
    closable: true,
  })
}
