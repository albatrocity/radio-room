import { describe, expect, it } from "vitest"
import { coffeePedal } from "."

describe("coffee-pedal", () => {
  it("registers the expected shortId", () => {
    expect(coffeePedal.shortId).toBe("coffee-pedal")
  })
})
