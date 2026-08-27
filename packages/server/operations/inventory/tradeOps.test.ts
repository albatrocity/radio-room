import { describe, expect, test, vi } from "vitest"
import type { AppContext, TradeSession } from "@repo/types"
import { tradeTyping } from "./tradeOps"

function openTrade(overrides?: Partial<TradeSession>): TradeSession {
  return {
    tradeId: "t1",
    roomId: "room1",
    status: "open",
    fromUserId: "a",
    toUserId: "b",
    participants: {
      a: { userId: "a", draft: [], offer: [], locked: false, confirmed: false },
      b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("tradeTyping", () => {
  test("returns the counterpart without taking io", async () => {
    const getTrade = vi.fn().mockResolvedValue(openTrade())
    const context = { trades: { getTrade } } as unknown as AppContext
    const result = await tradeTyping({
      roomId: "room1",
      userId: "a",
      tradeId: "t1",
      context,
    })
    expect(result).toEqual({ success: true, counterpartUserId: "b" })
  })

  test("rejects when the caller is not a participant", async () => {
    const getTrade = vi.fn().mockResolvedValue(openTrade())
    const context = { trades: { getTrade } } as unknown as AppContext
    const result = await tradeTyping({
      roomId: "room1",
      userId: "c",
      tradeId: "t1",
      context,
    })
    expect(result.success).toBe(false)
    expect(result.counterpartUserId).toBeUndefined()
  })
})
