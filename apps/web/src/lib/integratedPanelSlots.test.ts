import { describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/authActor", () => ({
  getIsAdmin: () => true,
}))
vi.mock("../actors/djActor", () => ({
  canAddToQueue: () => true,
}))
vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))

import { modalsMachine } from "../machines/modalsMachine"
import {
  integratedPanelOpenEvent,
  integratedPanelToggleEvent,
  resolveActiveIntegratedPanelSlot,
  resolveIntegratedPanelSlot,
} from "./integratedPanelSlots"

describe("integratedPanelSlots", () => {
  it("resolves gameState and adminSettings slots from modalsMachine", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "VIEW_GAME_STATE" })
    expect(resolveIntegratedPanelSlot(actor.getSnapshot())).toBe("gameState")

    actor.send({ type: "EDIT_SETTINGS" })
    expect(resolveIntegratedPanelSlot(actor.getSnapshot())).toBe("adminSettings")

    actor.send({ type: "CLOSE" })
    expect(resolveIntegratedPanelSlot(actor.getSnapshot())).toBeNull()
  })

  it("returns null for non-panel modalsMachine states", () => {
    const actor = createActor(modalsMachine).start()
    actor.send({ type: "EDIT_QUEUE" })
    expect(resolveIntegratedPanelSlot(actor.getSnapshot())).toBeNull()
  })

  it("resolveActiveIntegratedPanelSlot respects presentation mode", () => {
    const actor = createActor(modalsMachine).start()
    actor.send({ type: "VIEW_GAME_STATE" })
    const snapshot = actor.getSnapshot()

    expect(resolveActiveIntegratedPanelSlot(snapshot, "panel")).toBe("gameState")
    expect(resolveActiveIntegratedPanelSlot(snapshot, "modal")).toBeNull()
  })

  it("integratedPanelToggleEvent closes when slot is active", () => {
    expect(integratedPanelToggleEvent("gameState", "gameState")).toEqual({ type: "CLOSE" })
    expect(integratedPanelToggleEvent("adminSettings", "adminSettings")).toEqual({ type: "CLOSE" })
  })

  it("integratedPanelToggleEvent opens when slot is inactive", () => {
    expect(integratedPanelToggleEvent("gameState", null)).toEqual(integratedPanelOpenEvent("gameState"))
    expect(integratedPanelToggleEvent("adminSettings", "gameState")).toEqual(
      integratedPanelOpenEvent("adminSettings"),
    )
  })
})
