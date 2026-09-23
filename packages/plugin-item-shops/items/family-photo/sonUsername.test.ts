import { describe, expect, it } from "vitest"
import { sonDepthFromUsername, sonUsernameFor } from "./sonUsername"

describe("sonUsernameFor", () => {
  it("appends 's son", () => {
    expect(sonUsernameFor("Fritz")).toBe("Fritz's son")
  })

  it("nests the suffix", () => {
    expect(sonUsernameFor("Fritz's son")).toBe("Fritz's son's son")
  })
})

describe("sonDepthFromUsername", () => {
  it("returns 0 for plain names", () => {
    expect(sonDepthFromUsername("Fritz")).toBe(0)
  })

  it("counts nested suffixes", () => {
    expect(sonDepthFromUsername("Fritz's son")).toBe(1)
    expect(sonDepthFromUsername("Fritz's son's son")).toBe(2)
    expect(sonDepthFromUsername("Fritz's son's son's son")).toBe(3)
  })
})
