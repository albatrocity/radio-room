import { describe, expect, it } from "vitest"
import type { TradeSession } from "@repo/types"
import {
  isGameEventForUser,
  isGiftTradeEventForUser,
  tradeEscrowChanged,
  tradeHasUnknownDefinitions,
} from "./gameEventRelevance"

describe("isGameEventForUser", () => {
  it("matches on userId", () => {
    expect(isGameEventForUser({ userId: "me" }, "me")).toBe(true)
    expect(isGameEventForUser({ userId: "other" }, "me")).toBe(false)
  })

  it("treats both sides of a transfer as relevant", () => {
    expect(isGameEventForUser({ fromUserId: "me", toUserId: "other" }, "me")).toBe(true)
    expect(isGameEventForUser({ fromUserId: "other", toUserId: "me" }, "me")).toBe(true)
    expect(isGameEventForUser({ fromUserId: "other", toUserId: "third" }, "me")).toBe(false)
  })

  it("fails open when the event or the viewer has no user", () => {
    expect(isGameEventForUser({}, "me")).toBe(true)
    expect(isGameEventForUser(undefined, "me")).toBe(true)
    expect(isGameEventForUser({ userId: "other" }, undefined)).toBe(true)
  })
})

describe("isGiftTradeEventForUser", () => {
  it("matches nested offer / invite / trade parties", () => {
    expect(isGiftTradeEventForUser({ offer: { fromUserId: "me", toUserId: "b" } }, "me")).toBe(true)
    expect(isGiftTradeEventForUser({ offer: { fromUserId: "a", toUserId: "me" } }, "me")).toBe(true)
    expect(isGiftTradeEventForUser({ invite: { fromUserId: "a", toUserId: "b" } }, "me")).toBe(false)
    expect(
      isGiftTradeEventForUser({ trade: { fromUserId: "me", toUserId: "b" } }, "me"),
    ).toBe(true)
  })
})

describe("tradeEscrowChanged", () => {
  const base = {
    tradeId: "t1",
    roomId: "r1",
    status: "open",
    fromUserId: "a",
    toUserId: "b",
    createdAt: 1,
    updatedAt: 1,
    participants: {
      a: { userId: "a", draft: [], offer: [], locked: false, confirmed: false },
      b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
    },
  } as TradeSession

  it("is false for draft-only offer edits", () => {
    const next: TradeSession = {
      ...base,
      participants: {
        ...base.participants,
        a: { ...base.participants.a!, draft: [{ itemId: "i1", quantity: 1, definitionId: "d", slotPool: "inventory" }] },
      },
    }
    expect(tradeEscrowChanged(base, next)).toBe(false)
  })

  it("is true when a party locks or escrow count changes", () => {
    const locked: TradeSession = {
      ...base,
      participants: {
        ...base.participants,
        a: { ...base.participants.a!, locked: true, offer: [{ escrowKey: "e", originalItemId: "i1", definitionId: "d", sourcePlugin: "p", quantity: 1, slotPool: "inventory" }] },
      },
    }
    expect(tradeEscrowChanged(base, locked)).toBe(true)
  })
})

describe("tradeHasUnknownDefinitions", () => {
  const trade = {
    tradeId: "t1",
    roomId: "r1",
    status: "open",
    fromUserId: "a",
    toUserId: "b",
    createdAt: 1,
    updatedAt: 1,
    participants: {
      a: { userId: "a", draft: [], offer: [], locked: false, confirmed: false },
      b: {
        userId: "b",
        draft: [{ itemId: "i1", quantity: 1, definitionId: "item-shops:their-lp", slotPool: "inventory" }],
        offer: [],
        locked: false,
        confirmed: false,
      },
    },
  } as TradeSession

  it("is false when every SKU is already loaded", () => {
    expect(tradeHasUnknownDefinitions(trade, [{ id: "item-shops:their-lp" }])).toBe(false)
  })

  it("is true when the counterpart offers an unloaded SKU", () => {
    expect(tradeHasUnknownDefinitions(trade, [])).toBe(true)
  })
})
