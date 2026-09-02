import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  counterpartTradeAlerts,
  tradeAcceptedToastId,
  watchSnapshotForUser,
} from "./tradeSessionNotifications"
import { isItemDetailFrame, isTradeDetailFrame } from "../types/GameStateDetail"
import type { TradeSession } from "@repo/types"
import { locationMatchesTarget } from "./notificationTargets"
import { getNotificationLocation } from "../actors/notificationsActor"
import { TRADES_GIFTS_TAB } from "../constants/gameStateTabs"

vi.mock("../actors/notificationsActor", () => ({
  getNotificationLocation: vi.fn(() => ({ surface: null })),
}))

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

function isViewingTradeSession(tradeId: string): boolean {
  return locationMatchesTarget(getNotificationLocation(), {
    surface: "gameState",
    tabId: TRADES_GIFTS_TAB,
    frame: { kind: "trade", tradeId, title: "" },
  })
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

describe("isViewingTradeSession (via location)", () => {
  beforeEach(() => {
    vi.mocked(getNotificationLocation).mockReturnValue({ surface: null })
  })

  it("is false when location has no gameState surface", () => {
    expect(isViewingTradeSession("t1")).toBe(false)
  })

  it("is true only for the open trade detail frame", () => {
    vi.mocked(getNotificationLocation).mockReturnValue({
      surface: "gameState",
      tabId: TRADES_GIFTS_TAB,
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })

    expect(isViewingTradeSession("t1")).toBe(true)
    expect(isViewingTradeSession("other")).toBe(false)
  })
})
