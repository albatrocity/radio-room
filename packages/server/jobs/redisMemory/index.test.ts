import { describe, expect, it } from "vitest"
import { parseInfoMemory } from "./index"

describe("parseInfoMemory", () => {
  it("parses used_memory and maxmemory", () => {
    const info = ["# Memory", "used_memory:104857600", "maxmemory:262144000", ""].join("\r\n")
    expect(parseInfoMemory(info)).toEqual({ used: 104857600, max: 262144000 })
  })

  it("returns null when fields are missing", () => {
    expect(parseInfoMemory("used_memory:1")).toBeNull()
  })
})
