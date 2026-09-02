import { describe, expect, it } from "vitest"
import {
  PLAYER_TRANSFER_ERRORS,
  failIfActiveTrade,
  failIfDuplicateGiftPair,
  failIfDuplicateInvitePair,
  failIfOutgoingGift,
  failIfOutgoingInvite,
  failIfSelfTransfer,
  failIfTradingDisabled,
} from "./playerTransferRules"

describe("playerTransferRules", () => {
  it("rejects self gift and self trade with distinct copy", () => {
    expect(failIfSelfTransfer("a", "a", "gift")?.message).toBe(PLAYER_TRANSFER_ERRORS.giftToSelf)
    expect(failIfSelfTransfer("a", "a", "trade")?.message).toBe(PLAYER_TRANSFER_ERRORS.tradeWithSelf)
    expect(failIfSelfTransfer("a", "b", "gift")).toBeNull()
  })

  it("rejects when trading is disabled", () => {
    expect(failIfTradingDisabled(false)?.message).toBe(PLAYER_TRANSFER_ERRORS.tradingDisabled)
    expect(failIfTradingDisabled(true)).toBeNull()
  })

  it("rejects gift and invite occupancy", () => {
    expect(failIfOutgoingGift(true)?.message).toBe(PLAYER_TRANSFER_ERRORS.giftOutgoingExists)
    expect(failIfDuplicateGiftPair(true)?.message).toBe(PLAYER_TRANSFER_ERRORS.giftPairExists)
    expect(failIfOutgoingInvite(true)?.message).toBe(PLAYER_TRANSFER_ERRORS.tradeOutgoingInvite)
    expect(failIfDuplicateInvitePair(true)?.message).toBe(
      PLAYER_TRANSFER_ERRORS.tradeInvitePairExists,
    )
    expect(failIfActiveTrade(true, "self")?.message).toBe(PLAYER_TRANSFER_ERRORS.tradeActiveSelf)
    expect(failIfActiveTrade(true, "other")?.message).toBe(PLAYER_TRANSFER_ERRORS.tradeActiveOther)
  })
})
