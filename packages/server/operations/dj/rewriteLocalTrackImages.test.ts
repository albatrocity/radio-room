import { describe, expect, it, vi, beforeEach } from "vitest"
import { appContextFactory, metadataSourceTrackFactory } from "@repo/factories"

vi.mock("../data", () => ({
  storeImage: vi.fn(),
}))

import { storeImage } from "../data"
import { rewriteLocalTrackImages } from "./rewriteLocalTrackImages"

const DATA_URI = "data:image/jpeg;base64,abc123"

describe("rewriteLocalTrackImages", () => {
  beforeEach(() => {
    vi.mocked(storeImage).mockReset()
    vi.mocked(storeImage).mockResolvedValue({ success: true, imageId: "qimg-test" })
  })

  it("is a no-op when there are no data URIs", async () => {
    const context = appContextFactory.build()
    context.apiUrl = "https://api.example"
    const track = metadataSourceTrackFactory.build({
      images: [{ type: "image", url: "https://i.scdn.co/img.png", id: "a" }],
      album: {
        ...metadataSourceTrackFactory.build().album,
        images: [{ type: "image", url: "https://i.scdn.co/album.png", id: "b" }],
      },
    })

    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(result).toBe(track)
    expect(storeImage).not.toHaveBeenCalled()
  })

  it("rehosts data URIs onto the room image store", async () => {
    const context = appContextFactory.build()
    context.apiUrl = "https://api.example"
    const track = metadataSourceTrackFactory.build({
      images: [],
      album: {
        ...metadataSourceTrackFactory.build().album,
        images: [{ type: "image", url: DATA_URI, id: "al1" }],
      },
    })

    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(storeImage).toHaveBeenCalledTimes(1)
    expect(result.album.images[0]?.url).toMatch(
      /^https:\/\/api\.example\/api\/rooms\/room-1\/images\/qimg-[0-9a-f]{12}$/,
    )
    expect(result.album.images[0]?.url).not.toContain("data:")
  })

  it("drops data URIs when storeImage fails", async () => {
    vi.mocked(storeImage).mockResolvedValue({ success: false, error: new Error("nope") })
    const context = appContextFactory.build()
    const track = metadataSourceTrackFactory.build({
      images: [{ type: "image", url: DATA_URI, id: "t1" }],
    })

    const result = await rewriteLocalTrackImages({ context, roomId: "room-1", track })
    expect(result.images).toEqual([])
  })
})
