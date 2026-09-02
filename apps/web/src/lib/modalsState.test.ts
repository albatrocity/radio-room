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
import { isModalsIdle, matchesModals } from "./modalsState"

describe("modalsState", () => {
  it("matches logical surface names against parallel regions", () => {
    const actor = createActor(modalsMachine).start()
    expect(isModalsIdle(actor.getSnapshot())).toBe(true)

    actor.send({ type: "VIEW_GAME_STATE" })
    expect(matchesModals(actor.getSnapshot(), "gameState")).toBe(true)
    expect(matchesModals(actor.getSnapshot(), "queue")).toBe(false)
    expect(isModalsIdle(actor.getSnapshot())).toBe(false)

    actor.send({ type: "EDIT_QUEUE" })
    expect(matchesModals(actor.getSnapshot(), "gameState")).toBe(true)
    expect(matchesModals(actor.getSnapshot(), "queue")).toBe(true)

    actor.send({ type: "VIEW_FEEDBACK" })
    expect(matchesModals(actor.getSnapshot(), "gameState")).toBe(true)
    expect(matchesModals(actor.getSnapshot(), "queue")).toBe(true)
    expect(matchesModals(actor.getSnapshot(), "feedback")).toBe(true)
  })
})
