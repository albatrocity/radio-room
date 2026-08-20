import { describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))
vi.mock("../actors/authActor", () => ({
  getIsAdmin: () => true,
}))
vi.mock("../actors/djActor", () => ({
  canAddToQueue: () => true,
}))

import { modalsMachine } from "./modalsMachine"

describe("modalsMachine", () => {
  it("carries a Physical Media item into the queue modal and clears it on close", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "EDIT_QUEUE", browseMediaKey: "pm-nd-lp" })
    expect(actor.getSnapshot().matches("queue")).toBe(true)
    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBe("pm-nd-lp")

    actor.send({ type: "CLOSE" })
    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBeNull()
  })

  it("clears a stale item when the queue modal is opened normally", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "EDIT_QUEUE", browseMediaKey: "pm-nd-lp" })
    actor.send({ type: "VIEW_GAME_STATE" })
    actor.send({ type: "EDIT_QUEUE" })

    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBeNull()
  })

  it("opens Game State with an item detail deep-link and clears it on close", () => {
    const actor = createActor(modalsMachine).start()
    const frame = {
      kind: "item" as const,
      shortId: "pm-nd-lp",
      title: "ND LP",
      source: "inventory" as const,
      mediaKey: "pm-nd-lp",
    }

    actor.send({ type: "OPEN_GAME_STATE_ITEM_DETAIL", frame })
    expect(actor.getSnapshot().matches("gameState")).toBe(true)
    expect(actor.getSnapshot().context.gameStateDetailDeepLink).toEqual({
      tabId: "inventory",
      frame,
    })

    actor.send({ type: "CLEAR_GAME_STATE_ITEM_DETAIL_DEEP_LINK" })
    expect(actor.getSnapshot().context.gameStateDetailDeepLink).toBeNull()

    actor.send({
      type: "OPEN_GAME_STATE_ITEM_DETAIL",
      tabId: "item-shops:item-shops-tab",
      frame: { ...frame, source: "shop" },
    })
    expect(actor.getSnapshot().context.gameStateDetailDeepLink?.tabId).toBe(
      "item-shops:item-shops-tab",
    )

    actor.send({ type: "CLOSE" })
    expect(actor.getSnapshot().context.gameStateDetailDeepLink).toBeNull()
  })
})
