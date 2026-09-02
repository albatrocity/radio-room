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
vi.mock("../actors/gameStateNavActor", () => ({
  gameStateNavActor: { send: vi.fn() },
}))
vi.mock("../actors/userGameStateActor", () => ({
  refreshUserGameState: vi.fn(),
}))

import { gameStateNavActor } from "../actors/gameStateNavActor"
import { refreshUserGameState } from "../actors/userGameStateActor"
import { modalsMachine } from "./modalsMachine"

describe("modalsMachine", () => {
  it("carries a Physical Media item into the queue modal and clears it on close", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "EDIT_QUEUE", browseMediaKey: "pm-nd-lp" })
    expect(actor.getSnapshot().matches("queue.open")).toBe(true)
    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBe("pm-nd-lp")

    actor.send({ type: "CLOSE_QUEUE" })
    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBeNull()
  })

  it("clears a stale item when the queue modal is opened normally", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "EDIT_QUEUE", browseMediaKey: "pm-nd-lp" })
    actor.send({ type: "VIEW_GAME_STATE" })
    actor.send({ type: "EDIT_QUEUE" })

    expect(actor.getSnapshot().context.queueBrowseMediaKey).toBeNull()
  })

  it("keeps game state open when Add to Queue opens and closes", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "VIEW_GAME_STATE" })
    actor.send({ type: "EDIT_QUEUE" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("queue.open")).toBe(true)

    actor.send({ type: "CLOSE_QUEUE" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("queue.closed")).toBe(true)
  })

  it("keeps settings open when Add to Queue opens", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "EDIT_SETTINGS" })
    actor.send({ type: "EDIT_DJ" })
    actor.send({ type: "EDIT_QUEUE" })

    expect(actor.getSnapshot().matches("modal.settings.dj")).toBe(true)
    expect(actor.getSnapshot().matches("queue.open")).toBe(true)
  })

  it("keeps game state open when Feedback opens and closes", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "VIEW_GAME_STATE" })
    actor.send({ type: "VIEW_FEEDBACK" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("feedback.open")).toBe(true)

    actor.send({ type: "CLOSE_FEEDBACK" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("feedback.closed")).toBe(true)
  })

  it("keeps game state open when Help opens and closes", () => {
    const actor = createActor(modalsMachine).start()

    actor.send({ type: "VIEW_GAME_STATE" })
    actor.send({ type: "VIEW_HELP" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("help.open")).toBe(true)

    actor.send({ type: "CLOSE_HELP" })

    expect(actor.getSnapshot().matches("modal.gameState")).toBe(true)
    expect(actor.getSnapshot().matches("help.closed")).toBe(true)
  })

  it("activates game state nav and refreshes when Game State opens", () => {
    const actor = createActor(modalsMachine).start()
    actor.send({ type: "VIEW_GAME_STATE" })

    expect(gameStateNavActor.send).toHaveBeenCalledWith({ type: "ACTIVATE" })
    expect(refreshUserGameState).toHaveBeenCalled()

    actor.send({ type: "CLOSE" })
    expect(gameStateNavActor.send).toHaveBeenCalledWith({ type: "DEACTIVATE" })
  })
})
