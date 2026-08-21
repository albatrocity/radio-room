import { describe, expect, it } from "vitest"
import type { MetadataSourceUrl } from "@repo/types"
import {
  firstImageUrl,
  largestImageUrl,
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
})
