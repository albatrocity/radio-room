import { describe, expect, it } from "vitest"
import { blueberries } from "."

describe("blueberries", () => {
  it("registers the expected shortId", () => {
    expect(blueberries.shortId).toBe("blueberries")
  })
})
