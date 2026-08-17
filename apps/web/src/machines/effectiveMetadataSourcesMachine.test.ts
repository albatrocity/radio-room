import { describe, expect, it, vi, beforeEach } from "vitest"
import { createActor } from "xstate"

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
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

  it("refetches on inventory acquire/remove/use/transfer", () => {
    const actor = createActor(effectiveMetadataSourcesMachine).start()
    actor.send({ type: "ACTIVATE" })
    vi.mocked(emitToSocket).mockClear()

    actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: {} })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    vi.mocked(emitToSocket).mockClear()

    actor.send({ type: "INVENTORY_ITEM_REMOVED", data: {} })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    vi.mocked(emitToSocket).mockClear()

    actor.send({ type: "INVENTORY_ITEM_USED", data: {} })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    vi.mocked(emitToSocket).mockClear()

    actor.send({ type: "INVENTORY_ITEM_TRANSFERRED", data: {} })
    expect(emitToSocket).toHaveBeenCalledWith("GET_EFFECTIVE_METADATA_SOURCES", {})
    actor.stop()
  })
})
