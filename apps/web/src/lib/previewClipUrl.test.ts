import { describe, expect, it } from "vitest"
import { resolvePreviewClipUrl } from "./previewClipUrl"

describe("resolvePreviewClipUrl", () => {
  it("passes absolute CDN URLs through unchanged", () => {
    const cdn = "https://cdn.listeningroom.club/media/previews/v1/abc.mp3"
    expect(resolvePreviewClipUrl(cdn)).toBe(cdn)
  })

  it("passes absolute API URLs through unchanged", () => {
    const api = "https://api.listeningroom.club/api/rooms/r1/track-previews/p1"
    expect(resolvePreviewClipUrl(api)).toBe(api)
  })

  it("does not rewrite CDN media paths onto the API host", () => {
    // Regression: old helper stripped the host and prefixed VITE_API_URL,
    // producing api…/media/previews/… (404) for working CDN objects.
    const cdn =
      "https://cdn.listeningroom.club/media/previews/v1/74c1581624a786f6393f886a272ce978f09743cfde48133dccbedbc8db757452.mp3"
    const resolved = resolvePreviewClipUrl(cdn)
    expect(resolved).toBe(cdn)
    expect(resolved).not.toContain("api.listeningroom.club")
  })
})
