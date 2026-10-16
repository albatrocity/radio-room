import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request, Response } from "express"

const submitMediaData = vi.fn()
const findRoom = vi.fn()
const getAllRooms = vi.fn()
const readRoomScheduleSnapshot = vi.fn()
const readDeviceSession = vi.fn()

vi.mock("../lib/createJobApi", () => ({
  createJobApi: () => ({ submitMediaData }),
}))

vi.mock("../operations/data", async () => {
  const actual = await vi.importActual<typeof import("../operations/data")>("../operations/data")
  return {
    ...actual,
    findRoom: (...args: unknown[]) => findRoom(...args),
    getAllRooms: (...args: unknown[]) => getAllRooms(...args),
  }
})

vi.mock("../operations/scheduleRedisSnapshot", () => ({
  readRoomScheduleSnapshot: (...args: unknown[]) => readRoomScheduleSnapshot(...args),
}))

vi.mock("../lib/deviceSessionStore", () => ({
  readDeviceSession: (...args: unknown[]) => readDeviceSession(...args),
}))

import { deviceActiveSegment, deviceNowPlaying, deviceRooms } from "./deviceIngressController"

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.body = body
      return this
    },
    end() {
      return this
    },
  }
  return res as Response & { statusCode: number; body: unknown }
}

function mockReq(partial: {
  headers?: Request["headers"]
  body?: unknown
  query?: Request["query"]
  context?: unknown
}): Request {
  return partial as Request
}

describe("device ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DEVICE_INGRESS_SECRET = "pack-secret"
    submitMediaData.mockResolvedValue(undefined)
    readDeviceSession.mockResolvedValue(null)
  })

  it("rejects a missing bearer", async () => {
    const res = mockRes()
    await deviceNowPlaying(mockReq({ headers: {}, body: { roomId: "r", title: "T" } }), res)
    expect(res.statusCode).toBe(401)
    expect(submitMediaData).not.toHaveBeenCalled()
  })

  it("updates now playing with the same submission shape as the Redis subscriber", async () => {
    const res = mockRes()
    await deviceNowPlaying(
      mockReq({
        headers: { authorization: "Bearer pack-secret" },
        body: { roomId: "room-1", title: "Song", artist: "A", album: "B" },
        context: {},
      }),
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(submitMediaData).toHaveBeenCalledWith({
      roomId: "room-1",
      submission: {
        trackId: "A-Song-B",
        sourceType: "rtmp",
        title: "Song",
        artist: "A",
        album: "B",
      },
    })
  })

  it("clears now playing when the title is empty", async () => {
    const res = mockRes()
    await deviceNowPlaying(
      mockReq({
        headers: { authorization: "Bearer pack-secret" },
        body: { roomId: "room-1", title: "" },
        context: {},
      }),
      res,
    )
    expect(submitMediaData).toHaveBeenCalledWith({ roomId: "room-1" })
  })

  it("returns the active segment payload the Mac already parses", async () => {
    findRoom.mockResolvedValue({
      id: "room-1",
      showId: "show-1",
      activeSegmentId: "4",
    })
    readRoomScheduleSnapshot.mockResolvedValue({
      showId: "show-1",
      segments: [{ segmentId: "4", segment: { title: "Break" } }],
    })
    const res = mockRes()
    await deviceActiveSegment(
      mockReq({
        headers: { authorization: "Bearer pack-secret" },
        query: { roomId: "room-1" },
        context: {},
      }),
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      roomId: "room-1",
      showId: "show-1",
      segmentId: "4",
      segmentTitle: "Break",
    })
  })

  it("returns an empty body when no segment is active", async () => {
    findRoom.mockResolvedValue({ id: "room-1", activeSegmentId: null })
    const res = mockRes()
    await deviceActiveSegment(
      mockReq({
        headers: { authorization: "Bearer pack-secret" },
        query: { roomId: "room-1" },
        context: {},
      }),
      res,
    )
    expect(res.statusCode).toBe(204)
  })

  it("lists rooms for the local UI without Redis on the Mac", async () => {
    getAllRooms.mockResolvedValue([
      {
        id: "a",
        title: "Spotify Room",
        type: "radio",
        playbackControllerId: "spotify",
        playbackMode: "app-controlled",
        public: "true",
      },
      {
        id: "b",
        title: "Bridge Room",
        type: "radio",
        playbackControllerId: "bridge",
        playbackMode: "app-controlled",
        public: "false",
      },
    ])
    const res = mockRes()
    await deviceRooms(
      mockReq({
        headers: { authorization: "Bearer pack-secret" },
        context: {},
      }),
      res,
    )
    const body = res.body as { rooms: Array<{ id: string; bridgeReady: boolean; public: boolean }> }
    expect(body.rooms.map((room) => room.id)).toEqual(["b", "a"])
    expect(body.rooms[0].bridgeReady).toBe(true)
    expect(body.rooms[0].public).toBe(false)
  })
})
