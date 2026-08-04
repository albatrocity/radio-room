import { afterEach, describe, expect, it } from "vitest"
import { socketActor, subscribeById, unsubscribeById } from "./socketActor"

describe("subscribeById eventTypes allowlist", () => {
  const ids: string[] = []

  afterEach(() => {
    for (const id of ids) {
      unsubscribeById(id)
    }
    ids.length = 0
  })

  it("delivers only allowlisted SERVER_EVENT types when eventTypes is set", () => {
    const received: string[] = []
    const id = "test-allowlist-narrow"
    ids.push(id)
    subscribeById(id, {
      send: (event) => received.push(event.type),
      eventTypes: ["PLAYLIST", "QUEUE_CHANGED"],
    })

    socketActor.send({ type: "SERVER_EVENT", eventType: "MESSAGE_RECEIVED", data: {} })
    socketActor.send({ type: "SERVER_EVENT", eventType: "PLAYLIST", data: [] })
    socketActor.send({ type: "SERVER_EVENT", eventType: "QUEUE_CHANGED", data: { queue: [] } })
    socketActor.send({ type: "SERVER_EVENT", eventType: "REACTION_ADDED", data: {} })

    expect(received).toEqual(["PLAYLIST", "QUEUE_CHANGED"])
  })

  it("delivers all SERVER_EVENT types when eventTypes is omitted (back-compat)", () => {
    const received: string[] = []
    const id = "test-allowlist-unfiltered"
    ids.push(id)
    subscribeById(id, {
      send: (event) => received.push(event.type),
    })

    socketActor.send({ type: "SERVER_EVENT", eventType: "MESSAGE_RECEIVED", data: {} })
    socketActor.send({ type: "SERVER_EVENT", eventType: "PLAYLIST", data: [] })

    expect(received).toEqual(["MESSAGE_RECEIVED", "PLAYLIST"])
  })

  it("delivers SOCKET_* lifecycle broadcasts even when eventTypes is set", () => {
    const received: string[] = []
    const id = "test-allowlist-lifecycle"
    ids.push(id)
    subscribeById(id, {
      send: (event) => received.push(event.type),
      eventTypes: ["PLAYLIST"],
    })

    // Force a disconnect → reconnect cycle so broadcastOnline runs
    socketActor.send({ type: "SOCKET_DISCONNECTED", reason: "allowlist-test" })
    socketActor.send({ type: "SOCKET_CONNECTED" })

    expect(received).toContain("SOCKET_OFFLINE")
    expect(received).toContain("SOCKET_ONLINE")
    expect(received).not.toContain("MESSAGE_RECEIVED")
  })
})
