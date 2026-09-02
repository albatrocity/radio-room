export const PLAYER_TRANSFER_ERRORS = {
  tradingDisabled: "Trading is not enabled for this session",
  giftToSelf: "You can't gift an item to yourself",
  giftOutgoingExists: "You already have a pending gift offer",
  giftPairExists: "You already have a pending gift to that listener",
  tradeWithSelf: "You can't trade with yourself",
  tradeActiveSelf: "You already have an active trade",
  tradeActiveOther: "That listener is already in a trade",
  tradeOutgoingInvite: "You already have a pending trade invite",
  tradeInvitePairExists: "You already sent a trade invite to that listener",
} as const

export type PlayerTransferFailure = { success: false; message: string }

function fail(message: string): PlayerTransferFailure {
  return { success: false, message }
}

export function failIfSelfTransfer(
  fromUserId: string,
  toUserId: string,
  kind: "gift" | "trade",
): PlayerTransferFailure | null {
  if (fromUserId !== toUserId) return null
  return fail(kind === "gift" ? PLAYER_TRANSFER_ERRORS.giftToSelf : PLAYER_TRANSFER_ERRORS.tradeWithSelf)
}

export function failIfTradingDisabled(allowed: boolean): PlayerTransferFailure | null {
  if (allowed) return null
  return fail(PLAYER_TRANSFER_ERRORS.tradingDisabled)
}

export function failIfOutgoingGift(hasOutgoing: boolean): PlayerTransferFailure | null {
  if (!hasOutgoing) return null
  return fail(PLAYER_TRANSFER_ERRORS.giftOutgoingExists)
}

export function failIfDuplicateGiftPair(hasPair: boolean): PlayerTransferFailure | null {
  if (!hasPair) return null
  return fail(PLAYER_TRANSFER_ERRORS.giftPairExists)
}

export function failIfActiveTrade(
  hasTrade: boolean,
  whose: "self" | "other",
): PlayerTransferFailure | null {
  if (!hasTrade) return null
  return fail(
    whose === "self" ? PLAYER_TRANSFER_ERRORS.tradeActiveSelf : PLAYER_TRANSFER_ERRORS.tradeActiveOther,
  )
}

export function failIfOutgoingInvite(hasOutgoing: boolean): PlayerTransferFailure | null {
  if (!hasOutgoing) return null
  return fail(PLAYER_TRANSFER_ERRORS.tradeOutgoingInvite)
}

export function failIfDuplicateInvitePair(hasPair: boolean): PlayerTransferFailure | null {
  if (!hasPair) return null
  return fail(PLAYER_TRANSFER_ERRORS.tradeInvitePairExists)
}
