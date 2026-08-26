import { describe, expect, it } from "vitest"
import type { UserGameStatePayload } from "@repo/types"
import { hasIncomingTradesGiftsAttention } from "./tradesGiftsAttention"

const basePayload = {
  session: null,
  state: null,
  inventory: null,
  itemDefinitions: [],
  pluginUserState: {},
} satisfies UserGameStatePayload

describe("hasIncomingTradesGiftsAttention", () => {
  it("returns false when there are no pending incoming items", () => {
    expect(hasIncomingTradesGiftsAttention(basePayload)).toBe(false)
  })

  it("returns true when incoming gifts or invites remain", () => {
    expect(
      hasIncomingTradesGiftsAttention({
        ...basePayload,
        pendingGifts: {
          incoming: [{ offerId: "g1" } as any],
          outgoing: [],
        },
      }),
    ).toBe(true)
    expect(
      hasIncomingTradesGiftsAttention({
        ...basePayload,
        pendingTradeInvites: {
          incoming: [{ inviteId: "i1" } as any],
          outgoing: [],
        },
      }),
    ).toBe(true)
  })

  it("excludes a handled invite or gift from the unread check", () => {
    const payload = {
      ...basePayload,
      pendingGifts: {
        incoming: [{ offerId: "g1" } as any],
        outgoing: [],
      },
      pendingTradeInvites: {
        incoming: [{ inviteId: "i1" } as any],
        outgoing: [],
      },
    }
    expect(hasIncomingTradesGiftsAttention(payload, { excludeInviteId: "i1" })).toBe(true)
    expect(hasIncomingTradesGiftsAttention(payload, { excludeGiftOfferId: "g1" })).toBe(true)
    expect(
      hasIncomingTradesGiftsAttention(payload, {
        excludeInviteId: "i1",
        excludeGiftOfferId: "g1",
      }),
    ).toBe(false)
  })
})
