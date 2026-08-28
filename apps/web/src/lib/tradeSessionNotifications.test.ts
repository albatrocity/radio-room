import { describe, expect, it, vi } from "vitest"
import type { TradeSession } from "@repo/types"
import {
  counterpartTradeAlerts,
  isViewingTradeSession,
  tradeAcceptedToastId,
  watchSnapshotForUser,
} from "./tradeSessionNotifications"
import { isItemDetailFrame, isTradeDetailFrame } from "../types/GameStateDetail"

vi.mock("../actors/modalsActor", () => ({
  isModalOpen: vi.fn(() => false),
}))
vi.mock("../actors/gameStateNavActor", () => ({
  gameStateNavActor: {
    getSnapshot: vi.fn(() => ({
      matches: () => false,
      context: { activeTabId: "inventory", stacks: {} },
    })),
  },
}))
vi.mock("../actors/gameStateTradesGiftsAttentionActor", () => ({
  markTradesGiftsSessionViewed: vi.fn(),
}))

import { isModalOpen } from "../actors/modalsActor"
import { gameStateNavActor } from "../actors/gameStateNavActor"

function participant(userId: string, locked: boolean, confirmed: boolean) {
  return { userId, draft: [], offer: [], locked, confirmed }
}

function trade(overrides?: {
  meLocked?: boolean
  meConfirmed?: boolean
  otherLocked?: boolean
  otherConfirmed?: boolean
}): TradeSession {
  return {
    tradeId: "t1",
    roomId: "r1",
    status: "open",
    fromUserId: "me",
    toUserId: "them",
    createdAt: 1,
    updatedAt: 1,
    participants: {
      me: participant("me", overrides?.meLocked ?? false, overrides?.meConfirmed ?? false),
      them: participant(
        "them",
        overrides?.otherLocked ?? false,
        overrides?.otherConfirmed ?? false,
      ),
    },
  }
}

describe("watchSnapshotForUser", () => {
  it("reads the counterpart lock/confirm flags", () => {
    expect(watchSnapshotForUser(trade({ otherLocked: true, otherConfirmed: true }), "me")).toEqual({
      otherLocked: true,
      otherConfirmed: true,
    })
  })

  it("returns null when the user is not a participant", () => {
    expect(watchSnapshotForUser(trade(), "stranger")).toBeNull()
  })
})

describe("counterpartTradeAlerts", () => {
  it("alerts when the counterpart locks", () => {
    expect(
      counterpartTradeAlerts(
        { otherLocked: false, otherConfirmed: false },
        { otherLocked: true, otherConfirmed: false, iConfirmed: false },
      ),
    ).toEqual(["lock"])
  })

  it("alerts when the counterpart confirms and you have not", () => {
    expect(
      counterpartTradeAlerts(
        { otherLocked: true, otherConfirmed: false },
        { otherLocked: true, otherConfirmed: true, iConfirmed: false },
      ),
    ).toEqual(["confirm"])
  })

  it("does not alert confirm when you already confirmed", () => {
    expect(
      counterpartTradeAlerts(
        { otherLocked: true, otherConfirmed: false },
        { otherLocked: true, otherConfirmed: true, iConfirmed: true },
      ),
    ).toEqual([])
  })

  it("does not re-alert a lock that was already seen", () => {
    expect(
      counterpartTradeAlerts(
        { otherLocked: true, otherConfirmed: false },
        { otherLocked: true, otherConfirmed: false, iConfirmed: false },
      ),
    ).toEqual([])
  })
})

describe("tradeAcceptedToastId", () => {
  it("is stable per trade", () => {
    expect(tradeAcceptedToastId("t1")).toBe("trade-accepted-t1")
  })
})

describe("detail frame guards", () => {
  it("treats a missing frame as not a trade or item detail", () => {
    expect(isTradeDetailFrame(null)).toBe(false)
    expect(isItemDetailFrame(undefined)).toBe(false)
  })
})

describe("isViewingTradeSession", () => {
  it("does not throw when Game State is open on a tab with no detail frame", () => {
    vi.mocked(isModalOpen).mockReturnValue(true)
    vi.mocked(gameStateNavActor.getSnapshot).mockReturnValue({
      matches: (state: string) => state === "active",
      context: { activeTabId: "inventory", stacks: {} },
    } as ReturnType<typeof gameStateNavActor.getSnapshot>)

    expect(isViewingTradeSession("t1")).toBe(false)
  })

  it("is true only for the open trade detail frame", () => {
    vi.mocked(isModalOpen).mockReturnValue(true)
    vi.mocked(gameStateNavActor.getSnapshot).mockReturnValue({
      matches: (state: string) => state === "active",
      context: {
        activeTabId: "trades-gifts",
        stacks: {
          "trades-gifts": [{ kind: "trade", tradeId: "t1", title: "Trade with Alex" }],
        },
      },
    } as ReturnType<typeof gameStateNavActor.getSnapshot>)

    expect(isViewingTradeSession("t1")).toBe(true)
    expect(isViewingTradeSession("other")).toBe(false)
  })
})
