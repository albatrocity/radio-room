import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { appContextFactory } from "@repo/factories"
import type { TrackStatsDTO } from "@repo/types"

const mockResolveRoomMemberUserId = vi.hoisted(() => vi.fn())
const mockGetTrackStats = vi.hoisted(() => vi.fn())

vi.mock("../lib/resolveRoomMemberUserId", () => ({
  resolveRoomMemberUserId: mockResolveRoomMemberUserId,
}))

vi.mock("../operations/trackStats/getTrackStats", () => ({
  getTrackStats: mockGetTrackStats,
  TrackStatsBadRequestError: class TrackStatsBadRequestError extends Error {},
}))

import { getTrackStatsHandler } from "./trackStatsController"

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as Response & { statusCode: number; body: unknown }
}

const sampleStats: TrackStatsDTO = {
  firstPlay: false,
  showCount: 2,
  appearanceCount: 3,
  firstAppearance: { showTitle: "Old Show", addedAt: "2024-01-01T00:00:00.000Z" },
  recentAppearances: [],
  topDjs: [],
}

describe("getTrackStatsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveRoomMemberUserId.mockResolvedValue("user-1")
    mockGetTrackStats.mockResolvedValue(sampleStats)
  })

  it("returns 401 when not a room member", async () => {
    mockResolveRoomMemberUserId.mockResolvedValue(null)
    const req = {
      params: { roomId: "room-1" },
      query: { mediaSourceType: "spotify", mediaSourceTrackId: "abc" },
      context: appContextFactory.build(),
    } as unknown as Request
    const res = mockRes()

    await getTrackStatsHandler(req, res)

    expect(res.statusCode).toBe(401)
  })

  it("returns 404 when room missing", async () => {
    const context = appContextFactory.build()
    vi.spyOn(context.redis.pubClient, "exists").mockResolvedValue(0)
    const req = {
      params: { roomId: "room-1" },
      query: { mediaSourceType: "spotify", mediaSourceTrackId: "abc" },
      context,
    } as unknown as Request
    const res = mockRes()

    await getTrackStatsHandler(req, res)

    expect(res.statusCode).toBe(404)
  })

  it("returns 400 for invalid query params", async () => {
    const context = appContextFactory.build()
    vi.spyOn(context.redis.pubClient, "exists").mockResolvedValue(1)
    const req = {
      params: { roomId: "room-1" },
      query: { mediaSourceType: "spotify" },
      context,
    } as unknown as Request
    const res = mockRes()

    await getTrackStatsHandler(req, res)

    expect(res.statusCode).toBe(400)
  })

  it("returns stats for valid member request", async () => {
    const context = appContextFactory.build()
    vi.spyOn(context.redis.pubClient, "exists").mockResolvedValue(1)
    const req = {
      params: { roomId: "room-1" },
      query: {
        mediaSourceType: "local",
        mediaSourceTrackId: "nd-1",
        spotifyTrackId: "spotify:track:xyz",
      },
      context,
    } as unknown as Request
    const res = mockRes()

    await getTrackStatsHandler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ stats: sampleStats })
    expect(mockGetTrackStats).toHaveBeenCalledWith(context, {
      mediaSourceType: "local",
      mediaSourceTrackId: "nd-1",
      spotifyTrackId: "spotify:track:xyz",
    })
  })
})
