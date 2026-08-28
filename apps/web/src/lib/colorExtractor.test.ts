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

  it("leaves HTTP(S) cover URLs unchanged so the browser can reuse cache", () => {
    const coverUrl =
      "http://127.0.0.1:4533/rest/getCoverArt.view?id=song1&u=ross&t=authtoken&s=salt"
    expect(imageUrlForExtraction(coverUrl)).toBe(coverUrl)
    expect(imageUrlForExtraction("https://cdn.example/art.jpg")).toBe("https://cdn.example/art.jpg")
  })
})
