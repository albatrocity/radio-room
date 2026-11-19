import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))
vi.mock("../lib/toasts", () => ({
  toast: vi.fn(),
}))

import { emitToSocket } from "../actors/socketActor"
import { toast } from "../lib/toasts"
import { showMusicControlMachine } from "./showMusicControlMachine"

describe("showMusicControlMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches playback state on activate", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    expect(emitToSocket).toHaveBeenCalledWith("GET_PLAYBACK_STATE", {})
    expect(actor.getSnapshot().matches("active")).toBe(true)
    actor.stop()
  })

  it("applies PLAYBACK_STATE", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "PLAYBACK_STATE",
      data: { state: "paused", canResume: true },
    })
    expect(actor.getSnapshot().context).toEqual({
      transport: "paused",
      canResume: true,
    })
    actor.stop()
  })

  it("refreshes canResume on PLAYBACK_STATE_CHANGED", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    vi.mocked(emitToSocket).mockClear()
    actor.send({
      type: "PLAYBACK_STATE_CHANGED",
      data: { state: "paused" },
    })
    expect(emitToSocket).toHaveBeenCalledWith("GET_PLAYBACK_STATE", {})
    actor.stop()
  })

  it("enters pending on TOGGLE and clears on success", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "TOGGLE" })
    expect(emitToSocket).toHaveBeenCalledWith("TOGGLE_PLAYBACK", {})
    expect(actor.getSnapshot().matches({ active: "pending" })).toBe(true)

    actor.send({
      type: "TOGGLE_PLAYBACK_SUCCESS",
      data: { state: "playing", canResume: true },
    })
    expect(actor.getSnapshot().matches({ active: "ready" })).toBe(true)
    expect(actor.getSnapshot().context.transport).toBe("playing")
    actor.stop()
  })

  it("toasts when toggle advances to the next track", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "TOGGLE" })
    actor.send({
      type: "TOGGLE_PLAYBACK_SUCCESS",
      data: { state: "playing", action: "advanced", trackTitle: "Next Song" },
    })
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Now playing",
        description: "Next Song",
      }),
    )
    actor.stop()
  })

  it("toasts and leaves pending on toggle failure", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "TOGGLE" })
    actor.send({
      type: "TOGGLE_PLAYBACK_FAILURE",
      data: { message: "no device" },
    })
    expect(actor.getSnapshot().matches({ active: "ready" })).toBe(true)
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't control playback",
        description: "no device",
      }),
    )
    actor.stop()
  })

  it("resets on deactivate", () => {
    const actor = createActor(showMusicControlMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({
      type: "PLAYBACK_STATE",
      data: { state: "playing", canResume: true },
    })
    actor.send({ type: "DEACTIVATE" })
    expect(actor.getSnapshot().matches("inactive")).toBe(true)
    expect(actor.getSnapshot().context).toEqual({
      transport: null,
      canResume: false,
    })
    actor.stop()
  })
})
