import type { UserGameStatePayload } from "@repo/types"
import { getCurrentUser } from "../actors/authActor"
import { markTradesGiftsTabViewed } from "../actors/gameStateTradesGiftsAttentionActor"
import { getUserGameStatePayload } from "../actors/userGameStateActor"
import { dismissIncomingTradeInviteToasts } from "./tradeInviteToast"

export type TradesGiftsAttentionExclude = {
  excludeInviteId?: string
  excludeGiftOfferId?: string
}

/** Incoming gifts or trade invites that warrant the Trades/Gifts tab indicator. */
export function hasIncomingTradesGiftsAttention(
  payload: UserGameStatePayload | null,
  options?: TradesGiftsAttentionExclude,
): boolean {
  if (!payload) return false

  const incomingGifts = (payload.pendingGifts?.incoming ?? []).filter(
    (offer) => offer.offerId !== options?.excludeGiftOfferId,
  )
  const incomingInvites = (payload.pendingTradeInvites?.incoming ?? []).filter(
    (invite) => invite.inviteId !== options?.excludeInviteId,
  )

  return incomingGifts.length > 0 || incomingInvites.length > 0
}

/** Clear tab indicator when nothing incoming remains (optionally excluding a just-handled row). */
export function clearTradesGiftsTabAttentionIfEmpty(options?: TradesGiftsAttentionExclude): void {
  const payload = getUserGameStatePayload()
  const me = getCurrentUser()?.userId
  if (!me) return

  if (!hasIncomingTradesGiftsAttention(payload, options)) {
    markTradesGiftsTabViewed()
  }
}

/** Dismiss invite toasts and clear the tab badge when the Trades/Gifts tab is showing. */
export function viewTradesGiftsTab(): void {
  dismissIncomingTradeInviteToasts()
  clearTradesGiftsTabAttentionIfEmpty()
}
