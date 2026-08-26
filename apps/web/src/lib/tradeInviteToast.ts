import { getCurrentUser } from "../actors/authActor"
import { getUserGameStatePayload } from "../actors/userGameStateActor"
import { toaster } from "../components/ui/toaster"

export function tradeInviteToastId(inviteId: string): string {
  return `trade-invite-${inviteId}`
}

export function dismissTradeInviteToast(inviteId: string): void {
  toaster.dismiss(tradeInviteToastId(inviteId))
}

/** Dismiss trade-offer toasts once the user opens Trades/Gifts. */
export function dismissIncomingTradeInviteToasts(): void {
  const me = getCurrentUser()?.userId
  if (!me) return

  for (const invite of getUserGameStatePayload()?.pendingTradeInvites?.incoming ?? []) {
    dismissTradeInviteToast(invite.inviteId)
  }
}
