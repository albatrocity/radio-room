import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const stopTrackPreview = vi.fn()
vi.mock("../actors/trackPreviewActor", () => ({
  stopTrackPreview: () => stopTrackPreview(),
}))

const syncGameStateChildActors = vi.fn()
vi.mock("../lib/gameStateNavEffects", () => ({
  syncGameStateChildActors: (...args: unknown[]) => syncGameStateChildActors(...args),
}))

import { currentDetailFrame, gameStateNavMachine } from "./gameStateNavMachine"
import type { GameStateDetailFrame } from "../types/GameStateDetail"
import { STORED_ITEMS_TAB, TRADES_GIFTS_TAB } from "../constants/gameStateTabs"

const SHOP_TAB = "item-shops:item-shops-tab"

function frame(overrides: Partial<GameStateDetailFrame> = {}): GameStateDetailFrame {
  return {
    kind: "item",
    shortId: "pm-nd-lp",
    title: "ND LP",
    source: "inventory",
    mediaKey: "pm-nd-lp",
    ...overrides,
  }
}

function startActive() {
  const actor = createActor(gameStateNavMachine).start()
  actor.send({ type: "ACTIVATE" })
  return actor
}

describe("gameStateNavMachine", () => {
  beforeEach(() => {
    stopTrackPreview.mockClear()
    syncGameStateChildActors.mockClear()
  })

  it("shows the detail view once the active tab has a frame", () => {
    const actor = startActive()
    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)

    actor.send({ type: "PUSH_DETAIL", frame: frame() })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(currentDetailFrame(actor.getSnapshot().context)?.shortId).toBe("pm-nd-lp")
  })

  it("returns to the root view of whichever tab is picked", () => {
    const actor = startActive()
    actor.send({ type: "PUSH_DETAIL", frame: frame() })

    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)

    actor.send({ type: "SET_ACTIVE_TAB", tabId: "inventory" })
    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
  })

  it("leaves the detail view when the tab being viewed is picked again", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    actor.send({ type: "PUSH_DETAIL", frame: frame({ source: "shop" }) })
    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)

    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })

    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
  })

  it("accepts a deep-link before the modal opens and shows it on activate", () => {
    const actor = createActor(gameStateNavMachine).start()

    actor.send({ type: "OPEN_DETAIL_ON_TAB", tabId: SHOP_TAB, frame: frame({ source: "shop" }) })
    expect(actor.getSnapshot().matches("inactive")).toBe(true)

    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe(SHOP_TAB)
  })

  it("ignores a repeated ACTIVATE, so a Strict Mode double effect keeps the frame", () => {
    const actor = createActor(gameStateNavMachine).start()
    actor.send({ type: "OPEN_DETAIL_ON_TAB", tabId: "inventory", frame: frame() })

    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
  })

  it("keeps the frame on close, so the modal is not swapped out mid-animation", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    actor.send({ type: "PUSH_DETAIL", frame: frame({ source: "shop" }) })

    actor.send({ type: "DEACTIVATE" })
    expect(currentDetailFrame(actor.getSnapshot().context)).not.toBeNull()

    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe(SHOP_TAB)
  })

  it("drops every frame and the selected tab when the room is left", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    actor.send({ type: "PUSH_DETAIL", frame: frame({ source: "shop" }) })

    actor.send({ type: "RESET" })
    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")
  })

  it("shows trade detail when a trade frame is pushed", () => {
    const actor = startActive()
    actor.send({
      type: "PUSH_DETAIL",
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })
    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(currentDetailFrame(actor.getSnapshot().context)).toMatchObject({
      kind: "trade",
      tradeId: "t1",
    })
  })

  it("accepts SET_ACTIVE_TAB before the modal opens and shows that tab on activate", () => {
    const actor = createActor(gameStateNavMachine).start()

    actor.send({ type: "SET_ACTIVE_TAB", tabId: TRADES_GIFTS_TAB })
    expect(actor.getSnapshot().matches("inactive")).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe(TRADES_GIFTS_TAB)

    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe(TRADES_GIFTS_TAB)
  })

  it("snaps an unavailable tab to inventory while active", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: STORED_ITEMS_TAB })
    actor.send({
      type: "SET_AVAILABLE_TABS",
      tabIds: ["inventory", TRADES_GIFTS_TAB],
    })

    expect(actor.getSnapshot().status).toBe("active")
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")
    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({ navActive: true, tabId: "inventory", frame: null }),
    )
  })

  it("still accepts SET_ACTIVE_TAB after snapping an unavailable tab", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: STORED_ITEMS_TAB })
    actor.send({
      type: "SET_AVAILABLE_TABS",
      tabIds: ["inventory", SHOP_TAB],
    })

    expect(actor.getSnapshot().status).toBe("active")
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    expect(actor.getSnapshot().context.activeTabId).toBe(SHOP_TAB)
    expect(actor.getSnapshot().status).toBe("active")
  })

  it("keeps running after available-tab updates so tab clicks still work", () => {
    const actor = startActive()
    actor.send({ type: "SET_AVAILABLE_TABS", tabIds: ["inventory", SHOP_TAB] })
    actor.send({ type: "SET_AVAILABLE_TABS", tabIds: ["inventory", SHOP_TAB] })

    expect(actor.getSnapshot().status).toBe("active")
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    expect(actor.getSnapshot().context.activeTabId).toBe(SHOP_TAB)
    expect(actor.getSnapshot().status).toBe("active")
  })

  it("does not snap before available tabs are known", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: STORED_ITEMS_TAB })

    expect(actor.getSnapshot().context.activeTabId).toBe(STORED_ITEMS_TAB)
  })

  it("returns to inventory and drops the trade frame when the viewer is on the session", () => {
    const actor = startActive()
    actor.send({
      type: "OPEN_DETAIL_ON_TAB",
      tabId: TRADES_GIFTS_TAB,
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })
    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)

    actor.send({ type: "TRADE_SESSION_COMPLETED", goToInventory: true })

    expect(actor.getSnapshot().status).toBe("active")
    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")
    expect(actor.getSnapshot().context.stacks[TRADES_GIFTS_TAB]).toEqual([])
    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({ navActive: true, tabId: "inventory", frame: null }),
    )
  })

  it("drops the trade frame without changing tab when the viewer is elsewhere", () => {
    const actor = startActive()
    actor.send({
      type: "OPEN_DETAIL_ON_TAB",
      tabId: TRADES_GIFTS_TAB,
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })

    actor.send({ type: "TRADE_SESSION_COMPLETED", goToInventory: false })

    expect(actor.getSnapshot().context.activeTabId).toBe(SHOP_TAB)
    expect(actor.getSnapshot().context.stacks[TRADES_GIFTS_TAB]).toEqual([])
  })

  it("returns to the inventory index when the open item stack is removed", () => {
    const actor = startActive()
    actor.send({
      type: "PUSH_DETAIL",
      frame: frame({ inventoryItemId: "pm-stack-1" }),
    })
    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)

    actor.send({ type: "DROP_INVENTORY_DETAIL", itemId: "pm-stack-1" })

    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")
    expect(currentDetailFrame(actor.getSnapshot().context)).toBeNull()
  })

  it("leaves other detail frames in place when a different stack is removed", () => {
    const actor = startActive()
    actor.send({
      type: "PUSH_DETAIL",
      frame: frame({ inventoryItemId: "pm-keep" }),
    })

    actor.send({ type: "DROP_INVENTORY_DETAIL", itemId: "pm-other" })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(currentDetailFrame(actor.getSnapshot().context)?.inventoryItemId).toBe("pm-keep")
  })

  it("drops a missing inventory item frame when held ids are reconciled", () => {
    const actor = startActive()
    actor.send({
      type: "PUSH_DETAIL",
      frame: frame({ inventoryItemId: "pm-stack-1" }),
    })

    actor.send({ type: "RECONCILE_INVENTORY_DETAILS", heldItemIds: ["other-item"] })

    expect(actor.getSnapshot().matches({ active: "index" })).toBe(true)
    expect(currentDetailFrame(actor.getSnapshot().context)).toBeNull()
  })

  it("keeps shop detail frames when reconciling held inventory ids", () => {
    const actor = startActive()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })
    actor.send({
      type: "PUSH_DETAIL",
      frame: frame({ source: "shop", shopOfferId: 0 }),
    })

    actor.send({ type: "RECONCILE_INVENTORY_DETAILS", heldItemIds: [] })

    expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
    expect(currentDetailFrame(actor.getSnapshot().context)?.source).toBe("shop")
  })

  it("snaps on activate when the stored list already omits the current tab", () => {
    const actor = createActor(gameStateNavMachine).start()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: STORED_ITEMS_TAB })
    actor.send({
      type: "SET_AVAILABLE_TABS",
      tabIds: ["inventory", TRADES_GIFTS_TAB],
    })
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")

    actor.send({ type: "SET_ACTIVE_TAB", tabId: STORED_ITEMS_TAB })
    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().status).toBe("active")
    expect(actor.getSnapshot().context.activeTabId).toBe("inventory")
  })

  it("clears available tabs on deactivate so a trade deep-link is not snapped on reopen", () => {
    const actor = startActive()
    actor.send({
      type: "SET_AVAILABLE_TABS",
      tabIds: ["inventory", SHOP_TAB],
    })
    actor.send({ type: "DEACTIVATE" })
    expect(actor.getSnapshot().context.availableTabIds).toBeNull()

    actor.send({
      type: "OPEN_DETAIL_ON_TAB",
      tabId: TRADES_GIFTS_TAB,
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })
    actor.send({ type: "ACTIVATE" })

    expect(actor.getSnapshot().context.activeTabId).toBe(TRADES_GIFTS_TAB)
    expect(currentDetailFrame(actor.getSnapshot().context)?.kind).toBe("trade")
  })

  it("syncs child actors on activate, tab change, and deactivate", () => {
    const actor = createActor(gameStateNavMachine).start()
    actor.send({
      type: "SESSION_SNAPSHOT",
      allowTrading: true,
      activeTrade: null,
    })
    actor.send({ type: "ACTIVATE" })

    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({ navActive: true, allowTrading: true }),
    )

    syncGameStateChildActors.mockClear()
    actor.send({ type: "SET_ACTIVE_TAB", tabId: TRADES_GIFTS_TAB })
    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({
        navActive: true,
        tabId: TRADES_GIFTS_TAB,
        frame: null,
      }),
    )

    syncGameStateChildActors.mockClear()
    actor.send({ type: "DEACTIVATE" })
    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({ navActive: false }),
    )
  })

  it("syncs a trade detail frame when it is pushed while active", () => {
    const actor = startActive()
    syncGameStateChildActors.mockClear()
    actor.send({
      type: "PUSH_DETAIL",
      frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
    })

    expect(syncGameStateChildActors).toHaveBeenCalledWith(
      expect.objectContaining({
        navActive: true,
        frame: { kind: "trade", tradeId: "t1", title: "Trade with Alex" },
      }),
    )
  })

  describe("preview audio", () => {
    it("stops when the viewer goes back to the index", () => {
      const actor = startActive()
      actor.send({ type: "PUSH_DETAIL", frame: frame() })
      stopTrackPreview.mockClear()

      actor.send({ type: "POP_TO_INDEX" })

      expect(stopTrackPreview).toHaveBeenCalledTimes(1)
    })

    it("stops when the viewer switches to another tab", () => {
      const actor = startActive()
      actor.send({ type: "PUSH_DETAIL", frame: frame() })
      stopTrackPreview.mockClear()

      actor.send({ type: "SET_ACTIVE_TAB", tabId: SHOP_TAB })

      expect(stopTrackPreview).toHaveBeenCalledTimes(1)
    })

    it("stops when the modal closes, even though the frame is kept", () => {
      const actor = startActive()
      actor.send({ type: "PUSH_DETAIL", frame: frame() })
      stopTrackPreview.mockClear()

      actor.send({ type: "DEACTIVATE" })

      expect(stopTrackPreview).toHaveBeenCalledTimes(1)
    })

    it("stops when the room is left", () => {
      const actor = startActive()
      actor.send({ type: "PUSH_DETAIL", frame: frame() })
      stopTrackPreview.mockClear()

      actor.send({ type: "RESET" })

      expect(stopTrackPreview).toHaveBeenCalledTimes(1)
    })

    it("stops when one detail frame opens on top of another", () => {
      const actor = startActive()
      actor.send({ type: "PUSH_DETAIL", frame: frame() })
      stopTrackPreview.mockClear()

      actor.send({
        type: "PUSH_DETAIL",
        frame: frame({ shortId: "pm-other", mediaKey: "pm-other" }),
      })

      expect(actor.getSnapshot().matches({ active: "detail" })).toBe(true)
      expect(stopTrackPreview).toHaveBeenCalledTimes(1)
    })
  })
})
