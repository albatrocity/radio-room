import { describe, expect, it } from "vitest"
import { carrots } from "."

describe("carrots", () => {
  it("registers the expected shortId", () => {
    expect(carrots.shortId).toBe("carrots")
  })
})
