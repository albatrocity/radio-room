import { describe, expect, it, vi, beforeEach } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))
vi.mock("../actors/authActor", () => ({
  getCurrentUser: () => ({ userId: "me" }),
}))

import { emitToSocket } from "../actors/socketActor"
import { effectiveMetadataSourcesMachine } from "./effectiveMetadataSourcesMachine"

describe("effectiveMetadataSourcesMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches on activate and stores EFFECTIVE_METADATA_SOURCES", () => {
    const actor = createActor(effectiveMetadataSourcesMachine).start()
    actor.send({ type: "ACTIVATE" })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})

    actor.send({
      type: "EFFECTIVE_METADATA_SOURCES",
      data: {
        metadataSourceIds: ["spotify", "local"],
        browseableSourceIds: ["local"],
        browseSourceCapabilities: { local: { entryMode: "index", albumSearch: true } },
        myMedia: [{ mediaKey: "pm-1", name: "LP: Loveless" }],
      },
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.metadataSourceIds).toEqual(["spotify", "local"])
    expect(ctx.browseableSourceIds).toEqual(["local"])
    expect(ctx.browseSourceCapabilities.local).toEqual({
      entryMode: "index",
      albumSearch: true,
    })
    expect(ctx.myMedia).toEqual([{ mediaKey: "pm-1", name: "LP: Loveless" }])

    actor.send({ type: "DEACTIVATE" })
    expect(actor.getSnapshot().matches("idle")).toBe(true)
    expect(actor.getSnapshot().context.metadataSourceIds).toBeNull()
    actor.stop()
  })

  it("hydrates from INIT and refetches on ROOM_SETTINGS_UPDATED", () => {
    const actor = createActor(effectiveMetadataSourcesMachine).start()
    actor.send({ type: "ACTIVATE" })
    vi.mocked(emitToSocket).mockClear()

    actor.send({
      type: "INIT",
      data: {
        effectiveMetadataSourceIds: ["spotify"],
        browseableSourceIds: [],
      },
    })
    expect(actor.getSnapshot().context.metadataSourceIds).toEqual(["spotify"])

    actor.send({ type: "ROOM_SETTINGS_UPDATED", data: {} })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    actor.stop()
  })

  /** Runs `body` with an activated actor under fake timers, cleaning up either way. */
  async function withActiveActor(
    body: (
      actor: ReturnType<typeof createActor<typeof effectiveMetadataSourcesMachine>>,
    ) => Promise<void>,
  ) {
    vi.useFakeTimers()
    const actor = createActor(effectiveMetadataSourcesMachine).start()
    try {
      actor.send({ type: "ACTIVATE" })
      vi.mocked(emitToSocket).mockClear()
      await body(actor)
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
      actor.stop()
    }
  }

  it("collapses the current user's own inventory burst into one refetch", async () => {
    await withActiveActor(async (actor) => {
      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "me" } })
      actor.send({ type: "INVENTORY_ITEM_REMOVED", data: { userId: "me" } })
      actor.send({ type: "INVENTORY_ITEM_USED", data: { userId: "me" } })
      expect(emitToSocket).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(300)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    })
  })

  it("ignores inventory events belonging to other users", async () => {
    await withActiveActor(async (actor) => {
      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "someone-else" } })
      actor.send({ type: "INVENTORY_ITEM_USED", data: { userId: "someone-else" } })
      actor.send({
        type: "INVENTORY_ITEM_TRANSFERRED",
        data: { fromUserId: "someone-else", toUserId: "a-third-party" },
      })

      await vi.advanceTimersByTimeAsync(300)
      expect(emitToSocket).not.toHaveBeenCalled()
    })
  })

  it("refetches for transfers on either side", async () => {
    await withActiveActor(async (actor) => {
      actor.send({
        type: "INVENTORY_ITEM_TRANSFERRED",
        data: { fromUserId: "someone-else", toUserId: "me" },
      })
      await vi.advanceTimersByTimeAsync(300)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "INVENTORY_ITEM_TRANSFERRED",
        data: { fromUserId: "me", toUserId: "someone-else" },
      })
      await vi.advanceTimersByTimeAsync(300)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
    })
  })

  it("drops a pending refetch on DEACTIVATE", async () => {
    await withActiveActor(async (actor) => {
      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "me" } })
      actor.send({ type: "DEACTIVATE" })

      await vi.advanceTimersByTimeAsync(300)
      expect(emitToSocket).not.toHaveBeenCalled()
    })
  })
})
