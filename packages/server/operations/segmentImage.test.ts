import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext } from "@repo/types"

const m = vi.hoisted(() => ({
  findSegmentById: vi.fn(),
  setSegmentImageUrl: vi.fn(),
  afterSegmentChanged: vi.fn(),
  ensureSegmentImageObject: vi.fn(),
  prepareRoomImage: vi.fn(),
  getAssetBucket: vi.fn(() => "bucket"),
  getAssetCdnBaseUrl: vi.fn(() => "https://cdn.example"),
}))

vi.mock("../services/SchedulingService", () => ({
  findSegmentById: m.findSegmentById,
  setSegmentImageUrl: m.setSegmentImageUrl,
}))
vi.mock("./segmentChanged", () => ({ afterSegmentChanged: m.afterSegmentChanged }))
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

import { clearSegmentImage, SegmentImageError, uploadSegmentImage } from "./segmentImage"

const context = {} as AppContext

describe("uploadSegmentImage", () => {
  const file = { buffer: Buffer.from("x"), mimetype: "image/png", originalname: "a.png" }

  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(m.afterSegmentChanged).toHaveBeenCalledWith(context, "seg-1", {
      refreshStreamingDisplay: true,
    })
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
  })

  it("nulls the image URL and refreshes the streaming display", async () => {
    m.setSegmentImageUrl.mockResolvedValue({ id: "seg-1", imageUrl: null })
    const segment = await clearSegmentImage({ context, segmentId: "seg-1" })
    expect(m.setSegmentImageUrl).toHaveBeenCalledWith("seg-1", null)
    expect(segment).toEqual({ id: "seg-1", imageUrl: null })
    expect(m.afterSegmentChanged).toHaveBeenCalledWith(context, "seg-1", {
      refreshStreamingDisplay: true,
    })
  })
})
