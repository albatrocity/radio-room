import { describe, expect, it } from "vitest"
import { greenPeas } from "."

describe("green-peas", () => {
  it("registers the expected shortId", () => {
    expect(greenPeas.shortId).toBe("green-peas")
  })
})
