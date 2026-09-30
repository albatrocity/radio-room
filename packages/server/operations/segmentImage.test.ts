import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findShowIdsBySegmentId: vi.fn(),
  findSegmentById: vi.fn(),
  setSegmentImageUrl: vi.fn(),
  findRoomsByShowIds: vi.fn(),
  refreshRoomScheduleSnapshot: vi.fn(),
  enterStreamingMode: vi.fn(),
  ensureSegmentImageObject: vi.fn(),
  prepareRoomImage: vi.fn(),
  getAssetBucket: vi.fn(() => "bucket"),
  getAssetCdnBaseUrl: vi.fn(() => "https://cdn.example"),
}))

vi.mock("../services/SchedulingService", () => ({
  findShowIdsBySegmentId: m.findShowIdsBySegmentId,
  findSegmentById: m.findSegmentById,
  setSegmentImageUrl: m.setSegmentImageUrl,
}))
vi.mock("./showPublish", () => ({ findRoomsByShowIds: m.findRoomsByShowIds }))
vi.mock("./scheduleRedisSnapshot", () => ({
  refreshRoomScheduleSnapshot: m.refreshRoomScheduleSnapshot,
}))
vi.mock("./room/applyFetchMetaTransitionEffects", () => ({
  enterStreamingMode: m.enterStreamingMode,
}))
vi.mock("../services/MediaObjectCache", () => ({
  ensureSegmentImageObject: m.ensureSegmentImageObject,
}))
vi.mock("./data/prepareRoomImage", () => ({
  prepareRoomImage: m.prepareRoomImage,
  PrepareRoomImageError: class PrepareRoomImageError extends Error {},
}))
vi.mock("../lib/assetEnv", () => ({
  getAssetBucket: m.getAssetBucket,
  getAssetCdnBaseUrl: m.getAssetCdnBaseUrl,
}))

import {
  afterSegmentImageChanged,
  clearSegmentImage,
  SegmentImageError,
  uploadSegmentImage,
} from "./segmentImage"

const context = {} as AppContext

function room(over: Partial<Room>): Room {
  return {
    id: "r1",
    title: "Room",
    creator: "u1",
    type: "radio",
    fetchMeta: false,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "1",
    lastRefreshedAt: "1",
    ...over,
  }
}

describe("afterSegmentImageChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.findShowIdsBySegmentId.mockResolvedValue(["show-1"])
    m.findRoomsByShowIds.mockResolvedValue([])
  })

  it("refreshes snapshots and rebuilds streaming display only where the segment is active", async () => {
    m.findRoomsByShowIds.mockResolvedValue([
      { roomId: "r1", room: room({ id: "r1", activeSegmentId: "seg-1" }) },
      { roomId: "r2", room: room({ id: "r2", activeSegmentId: "seg-1", fetchMeta: true }) },
      { roomId: "r3", room: room({ id: "r3", activeSegmentId: "seg-other" }) },
    ])

    await afterSegmentImageChanged(context, "seg-1")

    expect(m.refreshRoomScheduleSnapshot).toHaveBeenCalledTimes(3)
    expect(m.enterStreamingMode).toHaveBeenCalledTimes(1)
    expect(m.enterStreamingMode).toHaveBeenCalledWith(context, "r1")
  })

  it("looks up rooms for every show containing the segment in one call", async () => {
    m.findShowIdsBySegmentId.mockResolvedValue(["show-1", "show-2", "show-3"])

    await afterSegmentImageChanged(context, "seg-1")

    expect(m.findRoomsByShowIds).toHaveBeenCalledTimes(1)
    expect(m.findRoomsByShowIds).toHaveBeenCalledWith(
      context,
      new Set(["show-1", "show-2", "show-3"]),
    )
    expect(m.refreshRoomScheduleSnapshot).not.toHaveBeenCalled()
  })

  it("no-ops without a context", async () => {
    await afterSegmentImageChanged(undefined, "seg-1")
    expect(m.findShowIdsBySegmentId).not.toHaveBeenCalled()
  })
})

describe("uploadSegmentImage", () => {
  const file = { buffer: Buffer.from("x"), mimetype: "image/png", originalname: "a.png" }

  beforeEach(() => {
    vi.clearAllMocks()
    m.findShowIdsBySegmentId.mockResolvedValue([])
    m.findSegmentById.mockResolvedValue({ id: "seg-1" })
    m.prepareRoomImage.mockResolvedValue({ buffer: Buffer.from("y"), mimeType: "image/jpeg" })
    m.ensureSegmentImageObject.mockResolvedValue({ url: "https://cdn.example/seg.jpg", uploaded: true })
    m.setSegmentImageUrl.mockResolvedValue({ id: "seg-1", imageUrl: "https://cdn.example/seg.jpg" })
  })

  it("stores the processed image and saves its CDN URL", async () => {
    const segment = await uploadSegmentImage({ context, segmentId: "seg-1", file })

    expect(m.ensureSegmentImageObject).toHaveBeenCalledWith({
      buffer: Buffer.from("y"),
      mimeType: "image/jpeg",
    })
    expect(m.setSegmentImageUrl).toHaveBeenCalledWith("seg-1", "https://cdn.example/seg.jpg")
    expect(segment).toEqual({ id: "seg-1", imageUrl: "https://cdn.example/seg.jpg" })
  })

  it("returns 404 for a missing segment", async () => {
    m.findSegmentById.mockResolvedValue(null)
    await expect(uploadSegmentImage({ context, segmentId: "nope", file })).rejects.toMatchObject({
      status: 404,
    })
  })

  it("returns 503 when asset storage is not configured", async () => {
    m.getAssetBucket.mockImplementationOnce(() => {
      throw new Error("ASSET_S3_BUCKET is not configured")
    })
    const err = await uploadSegmentImage({ context, segmentId: "seg-1", file }).catch((e) => e)
    expect(err).toBeInstanceOf(SegmentImageError)
    expect(err.status).toBe(503)
    expect(m.ensureSegmentImageObject).not.toHaveBeenCalled()
  })
})

describe("clearSegmentImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.findShowIdsBySegmentId.mockResolvedValue([])
  })

  it("nulls the image URL", async () => {
    m.setSegmentImageUrl.mockResolvedValue({ id: "seg-1", imageUrl: null })
    const segment = await clearSegmentImage({ context, segmentId: "seg-1" })
    expect(m.setSegmentImageUrl).toHaveBeenCalledWith("seg-1", null)
    expect(segment).toEqual({ id: "seg-1", imageUrl: null })
  })
})
