import { describe, expect, it } from "vitest"
import { tomatoes } from "."

describe("tomatoes", () => {
  it("registers the expected shortId", () => {
    expect(tomatoes.shortId).toBe("tomatoes")
  })
})
