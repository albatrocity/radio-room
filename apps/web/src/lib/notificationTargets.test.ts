import { describe, expect, it } from "vitest"
import {
  locationMatchesSurface,
  locationMatchesTarget,
} from "./notificationTargets"
import type { NotificationLocation } from "../types/Notification"

describe("locationMatchesTarget", () => {
  it("matches gameState tab without a frame", () => {
    const location: NotificationLocation = {
      surface: "gameState",
      tabId: "trades-gifts",
      frame: null,
    }
    expect(
      locationMatchesTarget(location, {
        surface: "gameState",
        tabId: "trades-gifts",
      }),
    ).toBe(true)
  })

  it("requires trade frame identity when target has a frame", () => {
    const location: NotificationLocation = {
      surface: "gameState",
      tabId: "trades-gifts",
      frame: { kind: "trade", tradeId: "t1", title: "Trade" },
    }
    expect(
      locationMatchesTarget(location, {
        surface: "gameState",
        tabId: "trades-gifts",
        frame: { kind: "trade", tradeId: "t1", title: "" },
      }),
    ).toBe(true)
    expect(
      locationMatchesTarget(location, {
        surface: "gameState",
        tabId: "trades-gifts",
        frame: { kind: "trade", tradeId: "other", title: "" },
      }),
    ).toBe(false)
  })

  it("returns false when surface is null", () => {
    expect(
      locationMatchesTarget({ surface: null }, {
        surface: "gameState",
        tabId: "inventory",
      }),
    ).toBe(false)
  })
})

describe("locationMatchesSurface", () => {
  it("matches any tab on the same surface", () => {
    expect(
      locationMatchesSurface(
        { surface: "gameState", tabId: "inventory", frame: null },
        { surface: "gameState", tabId: "trades-gifts" },
      ),
    ).toBe(true)
  })
})
