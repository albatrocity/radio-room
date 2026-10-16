import { describe, expect, it, vi } from "vitest"
import type { BridgeEvent } from "@repo/adapter-bridge/protocol"
import { Presence } from "./presence"

describe("Presence", () => {
  it("emits CAPABILITIES once at start", async () => {
    vi.useFakeTimers()
    const events: BridgeEvent[] = []
    const presence = new Presence((event) => {
      events.push(event)
    }, "room-1")

    await presence.start(["youtube", "local"])
    await vi.advanceTimersByTimeAsync(12_000)

    expect(events).toEqual([{ type: "CAPABILITIES", services: ["youtube", "local"] }])
    vi.useRealTimers()
  })

  it("re-sends CAPABILITIES when the socket connects again", async () => {
    const events: BridgeEvent[] = []
    const presence = new Presence((event) => {
      events.push(event)
    }, "room-1")

    presence.announce()
    expect(events).toEqual([])

    await presence.start(["local"])
    presence.announce()

    expect(events).toEqual([
      { type: "CAPABILITIES", services: ["local"] },
      { type: "CAPABILITIES", services: ["local"] },
    ])
  })
})
