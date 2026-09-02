import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const createNotificationToast = vi.fn()
const dismissNotificationToast = vi.fn()
const loadPersistedNotifications = vi.fn((): Record<string, unknown> => ({}))
const savePersistedNotifications = vi.fn()

vi.mock("../lib/notificationToastPort", () => ({
  createNotificationToast: (...args: unknown[]) => createNotificationToast(...args),
  dismissNotificationToast: (...args: unknown[]) => dismissNotificationToast(...args),
}))

vi.mock("../lib/notificationPersistence", () => ({
  loadPersistedNotifications: (...args: unknown[]) => loadPersistedNotifications(...args),
  savePersistedNotifications: (...args: unknown[]) => savePersistedNotifications(...args),
}))

import { notificationsMachine } from "./notificationsMachine"
import type { NotificationSpec } from "../types/Notification"

const TRADES = "trades-gifts"

function giftSpec(id = "gift-offer-1"): NotificationSpec {
  return {
    id,
    source: "gift",
    target: { surface: "gameState", tabId: TRADES },
    clearOn: "resolve",
    toast: {
      title: "Gift received",
      action: "open",
      duration: 8000,
    },
  }
}

function viewFlashSpec(id = "plugin-tab-x"): NotificationSpec {
  return {
    id,
    source: "plugin-tab",
    target: { surface: "gameState", tabId: "plugin:x" },
    clearOn: "view",
    persist: true,
  }
}

function tradeSessionSpec(tradeId = "t1"): NotificationSpec {
  return {
    id: `trade-lock-${tradeId}`,
    source: "trade-session",
    target: {
      surface: "gameState",
      tabId: TRADES,
      frame: { kind: "trade", tradeId, title: "Trade" },
    },
    clearOn: "view",
    dismissToastOn: "target",
    toast: { title: "Offer locked", action: "open", duration: 8000 },
  }
}

describe("notificationsMachine", () => {
  beforeEach(() => {
    createNotificationToast.mockClear()
    dismissNotificationToast.mockClear()
    loadPersistedNotifications.mockClear()
    loadPersistedNotifications.mockReturnValue({})
    savePersistedNotifications.mockClear()
  })

  it("raises idempotently by id without re-toasting", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: giftSpec() })
    actor.send({ type: "RAISE", spec: giftSpec() })

    expect(Object.keys(actor.getSnapshot().context.items)).toEqual(["gift-offer-1"])
    expect(createNotificationToast).toHaveBeenCalledTimes(1)
  })

  it("suppresses view-type raise when already at target", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: "plugin:x", frame: null },
    })
    actor.send({ type: "RAISE", spec: viewFlashSpec() })

    expect(actor.getSnapshot().context.items["plugin-tab-x"]).toBeUndefined()
    expect(createNotificationToast).not.toHaveBeenCalled()
  })

  it("stores resolve-type silently when already at target", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: TRADES, frame: null },
    })
    actor.send({ type: "RAISE", spec: giftSpec() })

    expect(actor.getSnapshot().context.items["gift-offer-1"]).toBeDefined()
    expect(createNotificationToast).not.toHaveBeenCalled()
  })

  it("clears view-type on LOCATION_CHANGED to target", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: viewFlashSpec() })
    expect(actor.getSnapshot().context.items["plugin-tab-x"]).toBeDefined()

    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: "plugin:x", frame: null },
    })

    expect(actor.getSnapshot().context.items["plugin-tab-x"]).toBeUndefined()
  })

  it("keeps resolve-type on location match but dismisses toast", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: giftSpec() })

    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: TRADES, frame: null },
    })

    expect(actor.getSnapshot().context.items["gift-offer-1"]).toBeDefined()
    expect(dismissNotificationToast).toHaveBeenCalledWith("gift-offer-1")
  })

  it("dismisses trade-accepted toast on surface open (dismissToastOn surface)", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({
      type: "RAISE",
      spec: {
        id: "trade-accepted-t1",
        source: "trade-session",
        target: {
          surface: "gameState",
          tabId: TRADES,
          frame: { kind: "trade", tradeId: "t1", title: "Trade" },
        },
        clearOn: "view",
        dismissToastOn: "surface",
        toast: { title: "Trade accepted", action: "open" },
      },
    })

    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: "inventory", frame: null },
    })

    expect(dismissNotificationToast).toHaveBeenCalledWith("trade-accepted-t1")
    // Not at trade frame yet — view clear should not remove
    expect(actor.getSnapshot().context.items["trade-accepted-t1"]).toBeDefined()
  })

  it("dismisses lock toast only when at trade target", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: tradeSessionSpec() })

    actor.send({
      type: "LOCATION_CHANGED",
      location: { surface: "gameState", tabId: TRADES, frame: null },
    })
    expect(dismissNotificationToast).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.items["trade-lock-t1"]).toBeDefined()

    dismissNotificationToast.mockClear()
    actor.send({
      type: "LOCATION_CHANGED",
      location: {
        surface: "gameState",
        tabId: TRADES,
        frame: { kind: "trade", tradeId: "t1", title: "Trade" },
      },
    })
    expect(dismissNotificationToast).toHaveBeenCalledWith("trade-lock-t1")
    expect(actor.getSnapshot().context.items["trade-lock-t1"]).toBeUndefined()
  })

  it("RECONCILE drops source items not in keepIds", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: giftSpec("gift-offer-1") })
    actor.send({ type: "RAISE", spec: giftSpec("gift-offer-2") })
    actor.send({ type: "RAISE", spec: viewFlashSpec() })

    actor.send({ type: "RECONCILE", source: "gift", keepIds: ["gift-offer-1"] })

    expect(actor.getSnapshot().context.items["gift-offer-1"]).toBeDefined()
    expect(actor.getSnapshot().context.items["gift-offer-2"]).toBeUndefined()
    expect(actor.getSnapshot().context.items["plugin-tab-x"]).toBeDefined()
  })

  it("fires toast-only notices without storing an indicator", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({
      type: "RAISE",
      spec: {
        id: "trade-complete-t1",
        source: "trade-session",
        target: null,
        clearOn: "resolve",
        toast: { title: "Trade complete", type: "success" },
      },
    })

    expect(Object.keys(actor.getSnapshot().context.items)).toEqual([])
    expect(createNotificationToast).toHaveBeenCalledWith(
      expect.objectContaining({ id: "trade-complete-t1" }),
    )
  })

  it("ROOM_LEFT clears items", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({ type: "RAISE", spec: giftSpec() })
    actor.send({ type: "ROOM_LEFT" })

    expect(actor.getSnapshot().context.items).toEqual({})
    expect(actor.getSnapshot().context.roomId).toBeNull()
  })

  it("loads persisted items on ROOM_ENTERED and saves persist-flagged ones", () => {
    loadPersistedNotifications.mockReturnValue({
      "plugin-tab-x": viewFlashSpec(),
    })
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })

    expect(loadPersistedNotifications).toHaveBeenCalledWith("r1")
    expect(actor.getSnapshot().context.items["plugin-tab-x"]).toBeDefined()

    actor.send({ type: "RAISE", spec: { ...viewFlashSpec("plugin-tab-y"), id: "plugin-tab-y" } })
    expect(savePersistedNotifications).toHaveBeenCalled()
  })

  it("upgrades a silent store when a later raise includes a toast", () => {
    const actor = createActor(notificationsMachine).start()
    actor.send({ type: "ROOM_ENTERED", roomId: "r1" })
    actor.send({
      type: "RAISE",
      spec: {
        id: "gift-offer-1",
        source: "gift",
        target: { surface: "gameState", tabId: TRADES },
        clearOn: "resolve",
      },
    })
    expect(createNotificationToast).not.toHaveBeenCalled()

    actor.send({ type: "RAISE", spec: giftSpec() })
    expect(createNotificationToast).toHaveBeenCalledTimes(1)
  })
})
