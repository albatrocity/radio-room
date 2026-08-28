import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { toaster } from "../components/ui/toaster"
import { subscribeForSocketResult } from "./subscribeForSocketResult"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))

vi.mock("../components/ui/toaster", () => ({
  toaster: { create: vi.fn() },
}))

describe("subscribeForSocketResult", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function capturedSend(): (event: { type: string; data?: unknown }) => void {
    const opts = vi.mocked(subscribeById).mock.calls[0]![1]
    return opts.send
  }

  it("allowlists the result event, settles on data, and unsubscribes", () => {
    const onResult = vi.fn()
    const cancel = subscribeForSocketResult({
      id: "ack-1",
      eventType: "INVENTORY_ACTION_RESULT",
      onResult,
    })

    expect(subscribeById).toHaveBeenCalledWith(
      "ack-1",
      expect.objectContaining({ eventTypes: ["INVENTORY_ACTION_RESULT"] }),
    )

    capturedSend()({ type: "SOCKET_ONLINE" })
    capturedSend()({ type: "INVENTORY_ACTION_RESULT" })
    expect(onResult).not.toHaveBeenCalled()

    capturedSend()({ type: "INVENTORY_ACTION_RESULT", data: { success: true } })
    expect(onResult).toHaveBeenCalledWith({ success: true })
    expect(unsubscribeById).toHaveBeenCalledWith("ack-1")

    capturedSend()({ type: "INVENTORY_ACTION_RESULT", data: { success: false } })
    expect(onResult).toHaveBeenCalledTimes(1)

    cancel()
    expect(unsubscribeById).toHaveBeenCalledTimes(1)
  })

  it("toasts and calls onTimeout after the default delay", () => {
    const onTimeout = vi.fn()
    subscribeForSocketResult({
      id: "ack-timeout",
      eventType: "PLUGIN_ACTION_RESULT",
      onResult: vi.fn(),
      onTimeout,
    })

    vi.advanceTimersByTime(9_999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(unsubscribeById).toHaveBeenCalledWith("ack-timeout")
    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Timeout", type: "error" }),
    )
  })

  it("does not start a timer when timeoutMs is 0", () => {
    subscribeForSocketResult({
      id: "ack-wait",
      eventType: "GIFT_ACTION_RESULT",
      onResult: vi.fn(),
      timeoutMs: 0,
    })
    vi.advanceTimersByTime(30_000)
    expect(unsubscribeById).not.toHaveBeenCalled()
    expect(toaster.create).not.toHaveBeenCalled()
  })
})
