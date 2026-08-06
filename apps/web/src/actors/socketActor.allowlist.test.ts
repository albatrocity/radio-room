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

  it("accepts typical room-machine allowlists used by audio / game / bridge", () => {
    const cases: { id: string; eventTypes: string[]; allow: string; deny: string }[] = [
      {
        id: "test-allowlist-audio-shape",
        eventTypes: [
          "INIT",
          "TRACK_CHANGED",
          "MEDIA_SOURCE_STATUS_CHANGED",
          "STREAM_HEALTH_CHANGED",
          "ROOM_SETTINGS_UPDATED",
          "PLAYLIST_TRACK_UPDATED",
        ],
        allow: "TRACK_CHANGED",
        deny: "MESSAGE_RECEIVED",
      },
      {
        id: "test-allowlist-game-session-shape",
        eventTypes: ["INIT", "GAME_SESSION_STARTED", "GAME_SESSION_ENDED", "USER_GAME_STATE"],
        allow: "GAME_SESSION_STARTED",
        deny: "QUEUE_CHANGED",
      },
      {
        id: "test-allowlist-media-bridge-shape",
        eventTypes: [
          "MEDIA_BRIDGE_STATUS_CHANGED",
          "LINK_MEDIA_BRIDGE_SUCCESS",
          "LINK_MEDIA_BRIDGE_FAILURE",
        ],
        allow: "MEDIA_BRIDGE_STATUS_CHANGED",
        deny: "INIT",
      },
      {
        id: "test-allowlist-dj-shape",
        eventTypes: [
          "INIT",
          "DEPUTY_BULK_APPLIED",
          "START_DEPUTY_DJ_SESSION",
          "END_DEPUTY_DJ_SESSION",
        ],
        allow: "START_DEPUTY_DJ_SESSION",
        deny: "MESSAGE_RECEIVED",
      },
    ]

    for (const c of cases) {
      const received: string[] = []
      ids.push(c.id)
      subscribeById(c.id, {
        send: (event) => received.push(event.type),
        eventTypes: c.eventTypes,
      })
      socketActor.send({ type: "SERVER_EVENT", eventType: c.deny, data: {} })
      socketActor.send({ type: "SERVER_EVENT", eventType: c.allow, data: {} })
      expect(received).toEqual([c.allow])
      unsubscribeById(c.id)
      ids.pop()
    }
  })
})
