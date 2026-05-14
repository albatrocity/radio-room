import { describe, expect, it } from "vitest"
import { lemons } from "."

describe("lemons", () => {
  it("registers the expected shortId", () => {
    expect(lemons.shortId).toBe("lemons")
  })
})
