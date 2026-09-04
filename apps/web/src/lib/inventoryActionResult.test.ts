import { beforeEach, describe, expect, it, vi } from "vitest"
import { subscribeById } from "../actors/socketActor"
import { toaster } from "../components/ui/toaster"
import { subscribeInventoryActionResult } from "./inventoryActionResult"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))

vi.mock("../components/ui/toaster", () => ({
  toaster: { create: vi.fn() },
}))

describe("subscribeInventoryActionResult", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function capturedSend(): (event: { type: string; data?: unknown }) => void {
    return vi.mocked(subscribeById).mock.calls[0]![1].send
  }

  it("passes through a custom toast duration", () => {
    subscribeInventoryActionResult({ id: "inv-1" })
    capturedSend()({
      type: "INVENTORY_ACTION_RESULT",
      data: {
        success: true,
        title: "Cassette restored to Good condition!",
        message: "You used the pencil to respool the tape and brought Mix Tape back to life.",
        duration: 10_000,
      },
    })
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Cassette restored to Good condition!",
        duration: 10_000,
        type: "success",
      }),
    )
  })

  it("omits duration when the result does not set one", () => {
    subscribeInventoryActionResult({ id: "inv-2" })
    capturedSend()({ type: "INVENTORY_ACTION_RESULT", data: { success: true, message: "Sold." } })
    const payload = vi.mocked(toaster.create).mock.calls[0]![0] as { duration?: number }
    expect(payload.duration).toBeUndefined()
  })
})
