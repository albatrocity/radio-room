import { emitToSocket } from "../actors/socketActor"
import { refreshUserGameState } from "../actors/userGameStateActor"
import { resolveGiftOffer } from "./giftInboxNotifications"
import { subscribeForSocketResult } from "./subscribeForSocketResult"
import { toaster } from "../components/ui/toaster"

export type GiftRespondAction = "ACCEPT_GIFT" | "DECLINE_GIFT" | "CANCEL_GIFT"

type GiftActionResult = { success?: boolean; message?: string }

export function emitGiftRespond(
  action: GiftRespondAction,
  offerId: string,
  options?: {
    onDone?: (success: boolean, message?: string) => void
    errorTitle?: string
  },
): void {
  const subscriptionId = `gift-respond-${offerId}-${Date.now()}`
  subscribeForSocketResult<GiftActionResult>({
    id: subscriptionId,
    eventType: "GIFT_ACTION_RESULT",
    onResult: (data) => {
      const success = data.success === true
      const message = data.message
      options?.onDone?.(success, message)
      if (success) {
        refreshUserGameState()
        if (action === "ACCEPT_GIFT" || action === "DECLINE_GIFT") {
          resolveGiftOffer(offerId)
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
    onTimeout: () => options?.onDone?.(false),
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
  subscribeForSocketResult<GiftActionResult>({
    id: subscriptionId,
    eventType: "GIFT_ACTION_RESULT",
    onResult: (data) => {
      onDone(data.success === true, data.message)
    },
    toastTimeout: false,
    onTimeout: () => onDone(false, "Action timed out"),
  })
  emitToSocket("OFFER_GIFT", { itemId, toUserId, quantity })
}
