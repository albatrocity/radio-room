import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

const stopTrackPreview = vi.fn()
vi.mock("../actors/trackPreviewActor", () => ({
  stopTrackPreview: () => stopTrackPreview(),
}))

import { currentDetailFrame, gameStateNavMachine } from "./gameStateNavMachine"
import type { GameStateDetailFrame } from "../types/GameStateDetail"

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
