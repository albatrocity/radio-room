import { describe, expect, it } from "vitest"
import { cucumberSlices } from "."

describe("cucumber-slices", () => {
  it("registers the expected shortId", () => {
    expect(cucumberSlices.shortId).toBe("cucumber-slices")
  })
})
