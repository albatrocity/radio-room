import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { refreshUserGameState } from "../../../actors/userGameStateActor"
import { clearTradesGiftsTabAttentionIfEmpty } from "../../../lib/tradesGiftsAttention"
import { toaster } from "../../ui/toaster"

export type GiftRespondAction = "ACCEPT_GIFT" | "DECLINE_GIFT" | "CANCEL_GIFT"

export function emitGiftRespond(
  action: GiftRespondAction,
  offerId: string,
  options?: {
    onDone?: (success: boolean, message?: string) => void
    errorTitle?: string
  },
): void {
  const subscriptionId = `gift-respond-${offerId}-${Date.now()}`
  subscribeById(subscriptionId, {
    send: (event: { type: string; data?: { success?: boolean; message?: string } }) => {
      if (event.type !== "GIFT_ACTION_RESULT" || !event.data) return
      unsubscribeById(subscriptionId)
      const success = event.data.success === true
      const message = event.data.message
      options?.onDone?.(success, message)
      if (success) {
        refreshUserGameState()
        if (action === "ACCEPT_GIFT" || action === "DECLINE_GIFT") {
          clearTradesGiftsTabAttentionIfEmpty({ excludeGiftOfferId: offerId })
        }
      } else if (message) {
        toaster.create({
          title: options?.errorTitle ?? "Gift",
          description: message,
          type: "error",
          duration: 6000,
          closable: true,
        })
      }
    },
    eventTypes: ["GIFT_ACTION_RESULT"],
  })
  emitToSocket(action, { offerId })
}

export function emitGiftOffer(
  itemId: string,
  toUserId: string,
  quantity: number,
  onDone: (success: boolean, message?: string) => void,
): void {
  const subscriptionId = `gift-offer-${itemId}-${Date.now()}`
  subscribeById(subscriptionId, {
    send: (event: { type: string; data?: { success?: boolean; message?: string } }) => {
      if (event.type !== "GIFT_ACTION_RESULT" || !event.data) return
      unsubscribeById(subscriptionId)
      onDone(event.data.success === true, event.data.message)
    },
    eventTypes: ["GIFT_ACTION_RESULT"],
  })
  emitToSocket("OFFER_GIFT", { itemId, toUserId, quantity })
}
