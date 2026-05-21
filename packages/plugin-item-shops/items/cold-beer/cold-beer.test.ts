import { describe, expect, it } from "vitest"
import { coldBeer } from "."

describe("cold-beer", () => {
  it("registers the expected shortId", () => {
    expect(coldBeer.shortId).toBe("cold-beer")
  })
})
