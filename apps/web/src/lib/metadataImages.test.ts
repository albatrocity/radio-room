import { describe, expect, it } from "vitest"
import type { MetadataSourceUrl } from "@repo/types"
import {
  featureImageUrl,
  firstImageUrl,
  largestImageUrl,
  mediaSessionArtwork,
  preferBrowserRenderableImages,
} from "./metadataImages"

function image(id: string, url: string): MetadataSourceUrl {
  return { type: "image", url, id }
}

describe("metadataImages", () => {
  it("returns undefined without images", () => {
    expect(firstImageUrl(undefined)).toBeUndefined()
    expect(largestImageUrl(undefined)).toBeUndefined()
    expect(largestImageUrl([])).toBeUndefined()
  })

  it("skips non-image urls", () => {
    const urls: MetadataSourceUrl[] = [
      { type: "resource", url: "https://open.spotify.com/album/1", id: "spotify" },
      image("300x300", "https://img/med"),
    ]
    expect(firstImageUrl(urls)).toBe("https://img/med")
    expect(largestImageUrl(urls)).toBe("https://img/med")
  })

  it("picks the biggest cover regardless of order", () => {
    const urls = [
      image("64x64", "https://img/small"),
      image("640x640", "https://img/large"),
      image("300x300", "https://img/med"),
    ]
    expect(firstImageUrl(urls)).toBe("https://img/small")
    expect(largestImageUrl(urls)).toBe("https://img/large")
    expect(featureImageUrl(urls)).toBe("https://img/med")
  })

  it("falls back to the first image when dimensions are unparseable", () => {
    const urls = [image("cover", "https://img/a"), image("also-cover", "https://img/b")]
    expect(largestImageUrl(urls)).toBe("https://img/a")
  })

  it("preferBrowserRenderableImages skips LAN Navidrome URLs for data URIs", () => {
    const lan = [image("al-1", "http://127.0.0.1:4533/rest/getCoverArt.view?id=al-1")]
    const data = [image("al-1", "data:image/jpeg;base64,abc")]
    expect(preferBrowserRenderableImages(lan, data)).toEqual(data)
    expect(preferBrowserRenderableImages(data, lan)).toEqual(data)
    expect(preferBrowserRenderableImages([image("x", "https://cdn.example/a.jpg")], data)).toEqual([
      image("x", "https://cdn.example/a.jpg"),
    ])
  })

  describe("mediaSessionArtwork", () => {
    it("declares each image's real dimensions, closest to 512 first", () => {
      const urls = [
        image("64x64", "https://img/sm"),
        image("640x640", "https://img/lg"),
        image("300x300", "https://img/med"),
      ]
      expect(mediaSessionArtwork(urls)).toEqual([
        { src: "https://img/lg", sizes: "640x640" },
        { src: "https://img/med", sizes: "300x300" },
        { src: "https://img/sm", sizes: "64x64" },
      ])
    })

    it("omits sizes rather than guessing when the id has no dimensions", () => {
      expect(mediaSessionArtwork([image("cover", "https://img/a")])).toEqual([
        { src: "https://img/a" },
      ])
    })

    it("sorts unsized images last, since WebKit must download them to rank them", () => {
      const urls = [image("cover", "https://img/unsized"), image("512x512", "https://img/ideal")]
      expect(mediaSessionArtwork(urls)).toEqual([
        { src: "https://img/ideal", sizes: "512x512" },
        { src: "https://img/unsized" },
      ])
    })

    it("falls back to room artwork so unmatched tracks are not a grey box", () => {
      expect(mediaSessionArtwork(undefined, "https://img/room.jpg")).toEqual([
        { src: "https://img/room.jpg" },
      ])
      expect(mediaSessionArtwork([], "https://img/room.jpg")).toEqual([
        { src: "https://img/room.jpg" },
      ])
    })

    it("is empty when there is nothing to show", () => {
      expect(mediaSessionArtwork(undefined, undefined)).toEqual([])
    })
  })
})
