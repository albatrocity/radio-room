import { describe, expect, it, vi, beforeEach } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))

vi.mock("../lib/toasts", () => ({
  toast: vi.fn(),
}))

import { emitToSocket } from "../actors/socketActor"
import { toast } from "../lib/toasts"
import { mediaBridgeMachine } from "./mediaBridgeMachine"

describe("mediaBridgeMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches status on activate and tracks connected", () => {
    const actor = createActor(mediaBridgeMachine).start()
    actor.send({ type: "ACTIVATE" })
    expect(emitToSocket).toHaveBeenCalledWith("GET_MEDIA_BRIDGE_STATUS", {})
    expect(actor.getSnapshot().matches({ active: "unknown" })).toBe(true)

    actor.send({ type: "MEDIA_BRIDGE_STATUS_CHANGED", data: { connected: true } })
    expect(actor.getSnapshot().matches({ active: "connected" })).toBe(true)

    actor.send({ type: "DEACTIVATE" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    actor.stop()
  })

  it("links and toasts on success/failure", () => {
    const actor = createActor(mediaBridgeMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "MEDIA_BRIDGE_STATUS_CHANGED", data: { connected: false } })

    actor.send({ type: "LINK" })
    expect(emitToSocket).toHaveBeenCalledWith("LINK_MEDIA_BRIDGE", {})
    expect(actor.getSnapshot().matches({ active: "linking" })).toBe(true)

    actor.send({ type: "LINK_MEDIA_BRIDGE_SUCCESS", data: { daemonId: "d1" } })
    expect(actor.getSnapshot().matches({ active: "connected" })).toBe(true)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))

    actor.send({ type: "MEDIA_BRIDGE_STATUS_CHANGED", data: { connected: false } })
    actor.send({ type: "LINK" })
    actor.send({
      type: "LINK_MEDIA_BRIDGE_FAILURE",
      data: { message: "No Media Bridge is online" },
    })
    expect(actor.getSnapshot().matches({ active: "disconnected" })).toBe(true)
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        description: "No Media Bridge is online",
      }),
    )
    actor.stop()
  })
})
