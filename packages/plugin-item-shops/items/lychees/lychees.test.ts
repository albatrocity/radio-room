import { describe, expect, it } from "vitest"
import { lychees } from "."

describe("lychees", () => {
  it("registers the expected shortId", () => {
    expect(lychees.shortId).toBe("lychees")
  })
})
