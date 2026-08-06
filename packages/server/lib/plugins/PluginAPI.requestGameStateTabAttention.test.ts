import { describe, expect, it, vi, beforeEach } from "vitest"
import { PluginAPIImpl } from "./PluginAPI"

vi.mock("../../operations/data", () => ({
  getRoomUsers: vi.fn(async () => [{ userId: "u1", id: "socket-1", username: "Alice" }]),
}))

describe("PluginAPIImpl.requestGameStateTabAttention", () => {
  let api: PluginAPIImpl
  let toEmit: ReturnType<typeof vi.fn>
  let to: ReturnType<typeof vi.fn>

  beforeEach(() => {
    toEmit = vi.fn()
    to = vi.fn(() => ({ emit: toEmit }))
    const io = { to } as any
    api = new PluginAPIImpl({} as any, io)
    api.setPluginContext("playlist-bingo", "room-1", { contributesUserGameState: true })
  })

  it("namespaces bare schema tab ids as pluginName:tabId", async () => {
    await api.requestGameStateTabAttention({ userId: "u1", tabId: "bingo-tab" })
    expect(to).toHaveBeenCalledWith("socket-1")
    expect(toEmit).toHaveBeenCalledWith("event", {
      type: "PLUGIN_TAB_ATTENTION",
      data: {
        roomId: "room-1",
        pluginName: "playlist-bingo",
        tabId: "playlist-bingo:bingo-tab",
        userId: "u1",
      },
    })
  })

  it("leaves already-namespaced tab ids unchanged", async () => {
    await api.requestGameStateTabAttention({
      userId: "u1",
      tabId: "playlist-bingo:bingo-tab",
    })
    expect(toEmit).toHaveBeenCalledWith(
      "event",
      expect.objectContaining({
        data: expect.objectContaining({ tabId: "playlist-bingo:bingo-tab" }),
      }),
    )
  })
})
