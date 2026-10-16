import { afterEach, describe, expect, it } from "vitest"
import {
  registerDeviceSocket,
  resetDeviceSessionsForTests,
  watchDeviceRoom,
} from "@repo/adapter-bridge"
import { DeviceSegmentBroadcaster } from "./DeviceSegmentBroadcaster"

afterEach(() => {
  resetDeviceSessionsForTests()
})

describe("DeviceSegmentBroadcaster", () => {
  it("pushes SEGMENT_ACTIVATED to device sockets in that room", () => {
    const events: unknown[] = []
    registerDeviceSocket({
      id: "watcher",
      daemonId: "local-remote",
      roomId: null,
      emit: (event, payload) => {
        events.push([event, payload])
      },
    })
    watchDeviceRoom("watcher", "room-1")

    new DeviceSegmentBroadcaster().handleEvent("room-1", "SEGMENT_ACTIVATED", {
      roomId: "room-1",
      showId: "show-1",
      segmentId: "4",
      segmentTitle: "Theme",
    })

    expect(events).toHaveLength(1)
    const [event, payload] = events[0] as [string, { segmentId: string; at: number }]
    expect(event).toBe("segment")
    expect(payload.segmentId).toBe("4")
    expect(payload.at).toEqual(expect.any(Number))
  })
})
