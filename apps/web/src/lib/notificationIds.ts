/** Stable notification / toast ids (parity with prior trade toast helpers). */

export function giftOfferNotificationId(offerId: string): string {
  return `gift-offer-${offerId}`
}

export function tradeInviteNotificationId(inviteId: string): string {
  return `trade-invite-${inviteId}`
}

export function tradeAcceptedNotificationId(tradeId: string): string {
  return `trade-accepted-${tradeId}`
}

export function tradeLockNotificationId(tradeId: string): string {
  return `trade-lock-${tradeId}`
}

export function tradeConfirmNotificationId(tradeId: string): string {
  return `trade-confirm-${tradeId}`
}

export function tradeCompleteNotificationId(tradeId: string): string {
  return `trade-complete-${tradeId}`
}

export function pluginTabNotificationId(tabId: string): string {
  return `plugin-tab-${tabId}`
}
