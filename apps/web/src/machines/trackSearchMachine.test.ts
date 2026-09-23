import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import { trackSearchMachine } from "./trackSearchMachine"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
}))

import { emitToSocket } from "../actors/socketActor"

describe("trackSearchMachine request queue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("queues a refined query while loading and only applies the latest results", () => {
    const actor = createActor(trackSearchMachine).start()

    actor.send({ type: "FETCH_RESULTS", value: "foo" })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(emitToSocket).toHaveBeenCalledWith("SEARCH_TRACK", {
      query: "foo",
      options: {},
    })
    expect(actor.getSnapshot().matches("loading")).toBe(true)

    actor.send({ type: "FETCH_RESULTS", value: "foobar" })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(actor.getSnapshot().context.queuedQuery).toBe("foobar")
    expect(actor.getSnapshot().context.results).toEqual([])

    actor.send({
      type: "TRACK_SEARCH_RESULTS",
      data: {
        items: [{ id: "stale" } as never],
        total: 1,
        offset: 0,
        limit: 20,
      },
    })

    expect(actor.getSnapshot().matches("loading")).toBe(true)
    expect(actor.getSnapshot().context.results).toEqual([])
    expect(emitToSocket).toHaveBeenCalledTimes(2)
    expect(emitToSocket).toHaveBeenLastCalledWith("SEARCH_TRACK", {
      query: "foobar",
      options: {},
    })

    actor.send({
      type: "TRACK_SEARCH_RESULTS",
      data: {
        items: [{ id: "fresh" } as never],
        total: 1,
        offset: 0,
        limit: 20,
      },
    })

    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.results).toEqual([{ id: "fresh" }])
    expect(actor.getSnapshot().context.queuedQuery).toBeUndefined()
    actor.stop()
  })

  it("applies results immediately when nothing is queued", () => {
    const actor = createActor(trackSearchMachine).start()
    actor.send({ type: "FETCH_RESULTS", value: "radio" })
    actor.send({
      type: "TRACK_SEARCH_RESULTS",
      data: {
        items: [{ id: "t1" } as never],
        total: 1,
        offset: 0,
        limit: 20,
      },
    })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.results).toEqual([{ id: "t1" }])
    actor.stop()
  })
})
