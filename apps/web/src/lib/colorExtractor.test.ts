import { describe, expect, it, vi } from "vitest"

vi.mock("colorthief", () => ({
  default: class ColorThief {
    getColor() {
      return [0, 0, 0]
    }
    getPalette() {
      return [[0, 0, 0]]
    }
  },
}))

import { imageUrlForExtraction } from "./colorExtractor"

describe("imageUrlForExtraction", () => {
  it("leaves data URIs unchanged (local metadata covers)", () => {
    const dataUri =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z"

    expect(imageUrlForExtraction(dataUri)).toBe(dataUri)
  })

  it("leaves blob URLs unchanged", () => {
    const blobUrl = "blob:https://listeningroom.club/abc-123"
    expect(imageUrlForExtraction(blobUrl)).toBe(blobUrl)
  })

  it("appends a cache-bust param that does not collide with Subsonic t=", () => {
    const coverUrl =
      "http://127.0.0.1:4533/rest/getCoverArt.view?id=song1&u=ross&t=authtoken&s=salt"
    const result = imageUrlForExtraction(coverUrl)

    expect(result.startsWith(`${coverUrl}&_cb=`)).toBe(true)
    expect(result).toMatch(/&_cb=\d+$/)
    // Auth token still present and not replaced
    expect(result).toContain("t=authtoken")
  })

  it("uses ? when the URL has no query string", () => {
    const result = imageUrlForExtraction("https://cdn.example/art.jpg")
    expect(result).toMatch(/^https:\/\/cdn\.example\/art\.jpg\?_cb=\d+$/)
  })
})
