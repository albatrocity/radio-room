import { describe, it, expect, vi, beforeEach } from "vitest"
import sharp from "sharp"
import {
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_UNPROCESSED_MAX_BYTES,
} from "@repo/types"

const mockConvert = vi.hoisted(() => vi.fn())

vi.mock("heic-convert", () => ({
  default: mockConvert,
}))

import { prepareRoomImage, PrepareRoomImageError } from "./prepareRoomImage"

async function createTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .png()
    .toBuffer()
}

describe("prepareRoomImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resizes a large PNG to JPEG at most CHAT_IMAGE_MAX_DIMENSION on the long edge", async () => {
    const input = await createTestPng(2000, 1500)
    const { buffer, mimeType } = await prepareRoomImage(input, "image/png", "photo.png")

    expect(mimeType).toBe("image/jpeg")
    const meta = await sharp(buffer).metadata()
    expect(meta.format).toBe("jpeg")
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      CHAT_IMAGE_MAX_DIMENSION,
    )
    expect(buffer.length).toBeLessThan(input.length)
  })

  it("strips EXIF from JPEG output", async () => {
    const input = await createTestPng(800, 600)
    const { buffer } = await prepareRoomImage(input, "image/png", "photo.png")
    const meta = await sharp(buffer).metadata()
    expect(meta.exif).toBeUndefined()
  })

  it("passes through small GIF unchanged", async () => {
    const gifBuffer = Buffer.from(
      "GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
      "binary",
    )
    const { buffer, mimeType } = await prepareRoomImage(gifBuffer, "image/gif", "anim.gif")
    expect(mimeType).toBe("image/gif")
    expect(buffer).toEqual(gifBuffer)
  })

  it("rejects GIF over CHAT_IMAGE_UNPROCESSED_MAX_BYTES", async () => {
    const oversized = Buffer.alloc(CHAT_IMAGE_UNPROCESSED_MAX_BYTES + 1, 0x47)
    await expect(
      prepareRoomImage(oversized, "image/gif", "big.gif"),
    ).rejects.toThrow(PrepareRoomImageError)
  })

  it("converts HEIC via heic-convert then compresses to JPEG", async () => {
    const fakeJpeg = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    mockConvert.mockResolvedValue(fakeJpeg)

    const heicInput = Buffer.from("fake-heic")
    const { buffer, mimeType } = await prepareRoomImage(
      heicInput,
      "image/heic",
      "IMG_1234.HEIC",
    )

    expect(mockConvert).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: heicInput, format: "JPEG" }),
    )
    expect(mimeType).toBe("image/jpeg")
    const meta = await sharp(buffer).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      CHAT_IMAGE_MAX_DIMENSION,
    )
  })

  it("detects HEIC by filename when mime is application/octet-stream", async () => {
    const fakeJpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    mockConvert.mockResolvedValue(fakeJpeg)

    await prepareRoomImage(Buffer.from("x"), "application/octet-stream", "photo.heic")
    expect(mockConvert).toHaveBeenCalled()
  })
})
