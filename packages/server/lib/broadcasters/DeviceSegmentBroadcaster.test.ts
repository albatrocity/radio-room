import { afterEach, describe, expect, it } from "vitest"
import type { Namespace } from "socket.io"
import {
  registerDeviceSocket,
  resetDeviceSessionsForTests,
  watchDeviceRoom,
} from "@repo/adapter-bridge"
import { DeviceSegmentBroadcaster } from "./DeviceSegmentBroadcaster"
import { bindDeviceNamespace, resetDeviceNamespaceForTests } from "../deviceSegmentFanout"

afterEach(() => {
  resetDeviceSessionsForTests()
  resetDeviceNamespaceForTests()
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
    const [event, payload] = events[0] as [string, { segmentId: string; at: number; cue: string }]
    expect(event).toBe("segment")
    expect(payload.segmentId).toBe("4")
    expect(payload.cue).toBe("activation")
    expect(payload.at).toEqual(expect.any(Number))
  })

  it("still emits on the local socket when the namespace room is bound", () => {
    const local: unknown[] = []
    const room: unknown[] = []
    bindDeviceNamespace({
      to: () => ({
        emit: (_event: string, payload: unknown) => {
          room.push(payload)
        },
      }),
    } as unknown as Namespace)
    registerDeviceSocket({
      id: "watcher",
      daemonId: "local-remote",
      roomId: null,
      emit: (_event, payload) => {
        local.push(payload)
      },
    })
    watchDeviceRoom("watcher", "room-1")

    new DeviceSegmentBroadcaster().handleEvent("room-1", "SEGMENT_ACTIVATED", {
      roomId: "room-1",
      showId: "show-1",
      segmentId: "4",
      segmentTitle: "Theme",
    })

    expect(local).toHaveLength(1)
    expect(room).toHaveLength(1)
  })
})
