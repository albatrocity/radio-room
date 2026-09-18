import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext, MetadataSourceTrack } from "@repo/types"

const ensureCoverObject = vi.hoisted(() =>
  vi.fn(async () => ({
    url: "https://cdn.example/media/covers/v1/abc/sm.jpg",
    contentHash: "abc",
    uploaded: true,
  })),
)
const resolveMediaLibraryId = vi.hoisted(() => vi.fn(async () => "daemon-1"))

vi.mock("../bridge/bridgeDaemonId", () => ({
  resolveMediaLibraryId,
}))

vi.mock("../../services/MediaObjectCache", () => ({
  ensureCoverObject,
}))

import { rewriteLocalTrackImages } from "./rewriteLocalTrackImages"

describe("rewriteLocalTrackImages", () => {
  const context = { apiUrl: "https://api.example" } as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("leaves https thumbs alone", async () => {
    const track = {
      images: [{ type: "image", url: "https://cdn.example/a.jpg", id: "1" }],
      album: { images: [{ type: "image", url: "https://cdn.example/b.jpg", id: "2" }] },
    } as MetadataSourceTrack
    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(ensureCoverObject).not.toHaveBeenCalled()
    expect(result).toBe(track)
  })

  it("uploads data URIs to S3 and rewrites URLs", async () => {
    const track = {
      images: [],
      album: {
        images: [
          {
            type: "image",
            url: "data:image/jpeg;base64,YWJj",
            id: "1",
          },
        ],
      },
    } as unknown as MetadataSourceTrack
    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(ensureCoverObject).toHaveBeenCalledTimes(1)
    expect(result.album.images[0]?.url).toBe(
      "https://cdn.example/media/covers/v1/abc/sm.jpg",
    )
  })

  it("drops data URIs when S3 upload fails", async () => {
    ensureCoverObject.mockRejectedValueOnce(new Error("nope"))
    const track = {
      images: [
        {
          type: "image",
          url: "data:image/jpeg;base64,YWJj",
          id: "1",
        },
      ],
      album: { images: [] },
    } as unknown as MetadataSourceTrack
    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(result.images).toEqual([])
  })
})
